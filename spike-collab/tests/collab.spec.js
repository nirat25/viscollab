const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('HTMLCollab MVP - Milestone 2 Polish', () => {
  let filePath;

  test.beforeAll(() => {
    filePath = `file:///${path.join(process.cwd(), 'index.html').replace(/\\/g, '/')}`;
  });

  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure clean state
    await page.goto(filePath);
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.goto(filePath);
  });

  test('Identity persists', async ({ page }) => {
    // 1. Check default identity (should be Nirat based on MEMBERS[0])
    await expect(page.locator('#userSwitch')).toHaveValue('Nirat');

    // 2. Change identity to Alex
    await page.locator('#userSwitch').selectOption('Alex');

    // 3. Reload page
    await page.reload();

    // 4. Verify identity persisted
    await expect(page.locator('#userSwitch')).toHaveValue('Alex');
  });

  test('Fuzzy matching for longer spans and orphan re-attach merge UX', async ({ page }) => {
    // 1. Create a text comment
    const targetQuote = "consolidate the three analytics vendors onto Vendor A this quarter";
    
    // Add comment
    await page.evaluate((q) => {
      window.__spike.addText(q, "Test comment here");
    }, targetQuote);

    // Verify comment is displayed
    const commentLoc = page.locator('.cmt').filter({ hasText: 'Test comment here' });
    await expect(commentLoc).toBeVisible();

    // 2. Edit the text to trigger fuzzy matching / merge UX
    await page.click('#editToggle'); // Enter edit mode
    
    // Modify the artifact content slightly (but keep it fuzzy matchable)
    await page.evaluate(() => {
      const lead = document.querySelector('#lead');
      lead.innerHTML = lead.innerHTML.replace("consolidate", "consolidate MODIFIED");
    });

    await page.click('#editToggle'); // Exit edit mode
    
    // 3. The comment should now be stale because the exact quote was lost, but it should be found via fuzzy logic.
    await expect(commentLoc).toBeVisible();
    
    // If it's stale, the anchor status might be "stale". Let's verify via API.
    const isStale = await page.evaluate(() => {
      const c = window.__spike.comments[0];
      return c.anchorStatus === 'stale';
    });
    expect(isStale).toBeTruthy();

    // 4. Click the "re-attach" or similar button if it exists.
    const reattachBtn = commentLoc.locator('button', { hasText: 'Re-attach' });
    await expect(reattachBtn).toBeVisible();
    await reattachBtn.click();

    // Now we need to select text to re-attach. Use real mouse drag.
    const leadBBox = await page.locator('#lead').boundingBox();
    await page.mouse.move(leadBBox.x + 5, leadBBox.y + 5);
    await page.mouse.down();
    await page.mouse.move(leadBBox.x + leadBBox.width - 5, leadBBox.y + leadBBox.height - 5, { steps: 5 });
    await page.mouse.up();
    
    // Verify merge modal appears
    await expect(page.locator('#mergepop')).toBeVisible();
    
    // Confirm merge
    await page.click('#mergeConfirm');
    
    // Verify comment is re-anchored
    const isAnchored = await page.evaluate(() => {
      const c = window.__spike.comments[0];
      return c.anchorStatus === 'anchored';
    });
    expect(isAnchored).toBeTruthy();
  });
  test('Fuzzy matching correctly handles truncation bug (prefix-modification)', async ({ page }) => {
    const targetQuote = "Recommendation: consolidate the three analytics vendors";
    await page.evaluate((q) => {
      window.__spike.addText(q, "Truncation test comment");
    }, targetQuote);

    const commentLoc = page.locator('.cmt').filter({ hasText: 'Truncation test comment' });
    await expect(commentLoc).toBeVisible();

    await page.click('#editToggle');
    await page.evaluate(() => {
      const lead = document.querySelector('#lead');
      lead.innerHTML = lead.innerHTML.replace("Recommendation: ", "Rec: ");
    });
    await page.click('#editToggle');

    await expect(commentLoc.locator('.b-stale')).toBeVisible();
    const isStale = await page.evaluate(() => window.__spike.comments[0].anchorStatus === 'stale');
    expect(isStale).toBeTruthy();
  });

  test('Disambiguation teleportation bug fixed for non-unique quotes', async ({ page }) => {
    // Inject a duplicate quote in two different contexts
    await page.click('#editToggle');
    await page.evaluate(() => {
      document.querySelector('#lead').innerHTML += " Duplicated quote test.";
      document.querySelector('#why').innerHTML += " Duplicated quote test.";
    });
    await page.click('#editToggle');

    // Add a comment to the first occurrence
    await page.evaluate(() => {
      window.__spike.addText("Duplicated quote test.", "Disambiguation test comment");
    });

    const commentLoc = page.locator('.cmt').filter({ hasText: 'Disambiguation test comment' });
    await expect(commentLoc).toBeVisible();

    // Edit the first occurrence in-place, changing its exact match and its context
    await page.click('#editToggle');
    await page.evaluate(() => {
      document.querySelector('#lead').innerHTML = document.querySelector('#lead').innerHTML.replace("covers every current use case. Duplicated quote test.", "covers NO current use case. Duplicated edited quote test.");
    });
    await page.click('#editToggle');

    // It should fall through `bs===0` into fuzzy match and be marked stale instead of orphaned
    await expect(commentLoc.locator('.b-stale')).toBeVisible();
    const isStale = await page.evaluate(() => window.__spike.comments[0].anchorStatus === 'stale');
    expect(isStale).toBeTruthy();
  });
});
