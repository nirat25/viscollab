# Handoff Report

## Observation
The auditor identified an INTEGRITY VIOLATION in `spike-collab/verify.js`: the test file relies on reading `index.html` as a raw string to perform `.includes()` checks for DOM structures, and it literally copies the `fuzzyFind` and `locate` application logic into the test file as a mock. This bypasses behavioral verification through a facade implementation and self-certifying tests.
Analysis of `package.json` shows that `@playwright/test` is already installed as a devDependency.
Analysis of `index.html` reveals that the application logic runs entirely in the browser (manipulating the DOM, using `TreeWalker`/`Range`, and persisting state via `localStorage`). It also exposes a programmatic API at `window.__spike` for state injection and manipulation.

## Logic Chain
1. To address the violation, `verify.js` must execute the actual application code within its intended environment (the browser) rather than analyzing static strings or using isolated mocks.
2. Since `@playwright/test` is available, `verify.js` can be rewritten as a Node script that uses Playwright (`const { chromium } = require('@playwright/test');`) to launch a headless browser and navigate to the local `index.html` file.
3. **Fuzzy Matching & Re-attach**: Instead of calling a mocked `locate_mock` function, the test can use Playwright's `page.evaluate()` to inject a comment via `window.__spike.addText()`, mutate the DOM text to simulate author edits (which breaks exact matches but satisfies fuzzy thresholds), and trigger a re-render. We can then inspect the comment's `anchorStatus` to genuinely verify it fell back to `'stale'` using the application's actual fuzzy match logic.
4. **Merge UX Modal**: The test can simulate clicking the "Re-attach" button on the stale comment, select new text, wait for `#mergepop` to become visible, and click "Confirm" to verify the DOM integration behaves correctly.
5. **Identity Persistence**: The test can select a new user from the `#userSwitch` dropdown, call `page.reload()` to refresh the browser, and assert that the dropdown correctly remembers the selected user, proving that `localStorage` state persists correctly without doing hardcoded string checks.

## Caveats
- Because the tests will run against a `file://` protocol URL in Playwright, ensuring that `localStorage` behaves as expected across page reloads may require waiting for the DOM to settle before reloading.

## Conclusion
The fix strategy is to completely rewrite `verify.js` as an automated browser test using Playwright. The script must load `index.html` and verify the three acceptance criteria (fuzzy matching, merge UX, and identity persistence) behaviorally via real DOM interactions (`page.click()`, `page.selectOption()`, `page.reload()`) and state assertions via `page.evaluate()`, strictly eliminating the use of `fs.readFileSync('index.html')` and duplicated application logic.

## Verification Method
1. The implementer rewrites `spike-collab/verify.js` using Playwright.
2. Inspect `verify.js` to confirm that `html.includes(...)` checks and the copied `fuzzyFind`/`locate` functions have been removed.
3. Run `node verify.js`. The output should show Playwright successfully launching the browser, executing the actions, and passing the assertions based on the actual UI behavior.
