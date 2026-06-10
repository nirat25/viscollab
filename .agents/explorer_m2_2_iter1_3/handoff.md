# Handoff Report: Milestone 2.2 Test Strategy and Plan

## 1. Observation
- The target environment is a client-side HTML/JS application located at `spike-collab/index.html`.
- The existing Playwright test file `tests/collab.spec.js` uses incorrect locators (e.g., `.comment` instead of `.cmt`) and lacks full coverage for fuzzy matching thresholds and the re-attach merge UX.
- **Identity** is governed by `currentUser`, stored in `localStorage('collab-user')`, and bound to the `#userSwitch` dropdown. Identity affects the sign-off roster and notification bell.
- **Fuzzy Matching** utilizes `diff_match_patch`. A comment status becomes `stale` if an exact match is lost but the fuzzy score remains >= 0.60 (`FUZZY_THRESHOLD`). If the text is altered beyond this threshold, the status becomes `orphaned`.
- **Re-attach Merge UX** triggers a `#mergepop` modal. Re-attaching a text comment requires text selection, whereas re-attaching an element comment requires clicking an element. Both actions culminate in confirming the change via `#mergeConfirm`.

## 2. Logic Chain
- To guarantee the application behaves as expected under M2.2 requirements, tests must be executed locally against `file:///.../index.html` with an isolated `localStorage` state for each test.
- The `Identity` test suite must verify that dropdown changes update `localStorage`, survive page reloads, and accurately update identity-dependent UI components (like the sign-off roster).
- The `Fuzzy Matching` suite must simulate user edits. By toggling `#editToggle`, modifying innerHTML, and toggling back, we can test both the `stale` (minor edit) and `orphaned` (major edit) states. Badges (`.b-stale`, `.b-orphaned`) will serve as assertions.
- The `Re-attach Merge UX` suite must cover text and element feedback separately. Since text selection is notoriously difficult to simulate purely via Playwright actions, we must inject a script via `page.evaluate` to create a `Range`, apply it to `window.getSelection()`, and dispatch a `mouseup` event to invoke the application's listener.

## 3. Caveats
- I was unable to execute `npx playwright test` directly due to local permission constraints. Consequently, the provided Playwright locators and evaluate scripts are based entirely on static analysis of `index.html`. 
- The selection simulation logic relies on standard DOM APIs which should work reliably, but might require minor tweaking if the underlying HTML structure of `#artifact` changes.

## 4. Conclusion
The testing strategy requires replacing the contents of `tests/collab.spec.js` with comprehensive suites for Identity, Fuzzy Matching, and Re-attach UX. This robust test suite will fully satisfy the M2.2 testing requirements.

**Proposed Implementation for `tests/collab.spec.js`:**

```javascript
const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Milestone 2.2 Polish - Testing', () => {
  let filePath;

  test.beforeAll(() => {
    filePath = `file:///${path.join(process.cwd(), 'index.html').replace(/\\/g, '/')}`;
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(filePath);
    await page.evaluate(() => localStorage.clear());
    await page.goto(filePath);
  });

  test.describe('Identity', () => {
    test('Identity persists across reloads and updates UI', async ({ page }) => {
      // Default identity
      await expect(page.locator('#userSwitch')).toHaveValue('Nirat');
      await expect(page.locator('#signoff')).toContainText('Your sign-off (Nirat)');

      // Switch identity
      await page.locator('#userSwitch').selectOption('Alex');
      await expect(page.locator('#signoff')).toContainText('Your sign-off (Alex)');

      // Persists across reload
      await page.reload();
      await expect(page.locator('#userSwitch')).toHaveValue('Alex');
      await expect(page.locator('#signoff')).toContainText('Your sign-off (Alex)');
    });

    test('Identity dictates notification routing', async ({ page }) => {
      // Nirat mentions Alex
      await page.evaluate(() => {
        window.__spike.addText("consolidate the three analytics vendors", "Hey @Alex check this out");
      });
      await expect(page.locator('#bellDot')).toBeHidden();

      // Switch to Alex
      await page.locator('#userSwitch').selectOption('Alex');
      await expect(page.locator('#bellDot')).toBeVisible();
      await expect(page.locator('#bellDot')).toHaveText('1');
    });
  });

  test.describe('Fuzzy Matching', () => {
    test('Minor edit results in stale status via fuzzy match', async ({ page }) => {
      const quote = "consolidate the three analytics vendors onto Vendor A this quarter";
      await page.evaluate((q) => window.__spike.addText(q, "Fuzzy test"), quote);

      await page.click('#editToggle');
      await page.evaluate((q) => {
        const art = document.querySelector('#artifact');
        art.innerHTML = art.innerHTML.replace(q, q.replace("Vendor A", "Vendor X"));
      }, quote);
      await page.click('#editToggle');

      const comment = page.locator('.cmt').filter({ hasText: 'Fuzzy test' });
      await expect(comment.locator('.b-stale')).toBeVisible();
    });

    test('Major edit results in orphaned status', async ({ page }) => {
      const quote = "consolidate the three analytics vendors onto Vendor A this quarter";
      await page.evaluate((q) => window.__spike.addText(q, "Orphan test"), quote);

      await page.click('#editToggle');
      await page.evaluate((q) => {
        const art = document.querySelector('#artifact');
        art.innerHTML = art.innerHTML.replace(q, "completely unrelated text that will not match anything at all");
      }, quote);
      await page.click('#editToggle');

      const comment = page.locator('.cmt').filter({ hasText: 'Orphan test' });
      await expect(comment.locator('.b-orphaned')).toBeVisible();
    });
  });

  test.describe('Re-attach Merge UX', () => {
    test('Re-attach orphaned text comment to new text', async ({ page }) => {
      const quote = "consolidate the three analytics vendors onto Vendor A this quarter";
      await page.evaluate((q) => window.__spike.addText(q, "Text re-attach test"), quote);

      // Orphan the comment
      await page.click('#editToggle');
      await page.evaluate((q) => {
        const art = document.querySelector('#artifact');
        art.innerHTML = art.innerHTML.replace(q, "");
      }, quote);
      await page.click('#editToggle');

      const comment = page.locator('.cmt').filter({ hasText: 'Text re-attach test' });
      await expect(comment.locator('.b-orphaned')).toBeVisible();

      // Trigger re-attach
      await comment.locator('button', { hasText: 'Re-attach' }).click();
      await expect(comment.locator('button', { hasText: 'Pick / select…' })).toBeVisible();

      // Select new text
      await page.evaluate(() => {
        const p = document.querySelector('#artifact p');
        const range = document.createRange();
        range.setStart(p.firstChild, 0);
        range.setEnd(p.firstChild, 20);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup'));
      });

      // Confirm merge
      await expect(page.locator('#mergepop')).toBeVisible();
      await page.click('#mergeConfirm');

      await expect(comment.locator('.b-anchored')).toBeVisible();
    });

    test('Re-attach orphaned element comment to new element', async ({ page }) => {
      // Add element comment
      await page.evaluate(() => {
        window.__spike.addEl('#options', 'flag', 'Element re-attach test');
      });

      // Orphan the comment
      await page.click('#editToggle');
      await page.evaluate(() => document.querySelector('#options').remove());
      await page.click('#editToggle');

      const comment = page.locator('.cmt').filter({ hasText: 'Element re-attach test' });
      await expect(comment.locator('.b-orphaned')).toBeVisible();

      // Trigger re-attach
      await comment.locator('button', { hasText: 'Re-attach' }).click();

      // Click new element
      await page.click('#risks');

      // Confirm merge
      await expect(page.locator('#mergepop')).toBeVisible();
      await page.click('#mergeConfirm');

      await expect(comment.locator('.b-anchored')).toBeVisible();
      await expect(comment.locator('.q')).toContainText('h2'); // The #risks tag is h2
    });
  });
});
```

## 5. Verification Method
- Instruct the implementing agent to apply the test code to `spike-collab/tests/collab.spec.js`.
- Run the test suite: `cd spike-collab && npx playwright test`.
- All 6 tests in the suite should pass without errors, validating the functionality of Identity, Fuzzy Matching, and the Re-attach Merge UX.
