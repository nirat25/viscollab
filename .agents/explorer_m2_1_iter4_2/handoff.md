# Handoff Report

## Observation
The forensic auditor identified an INTEGRITY VIOLATION in `spike-collab/verify.js`. Specifically:
1. The test checks for application state using literal string matching on the source file (e.g., `html.includes('id="mergepop"')`), acting as a facade implementation.
2. The test bypasses the actual application logic by manually copying the `fuzzyFind` and `locate` functions into the test script as `locate_mock` and asserting against it, representing a self-certifying test.
Furthermore, `package.json` includes `@playwright/test` in `devDependencies`, indicating an intention or capability to use browser automation, but it was ignored in favor of the string-matching approach.

## Logic Chain
To properly fulfill the acceptance criteria ("Automated tests are implemented to verify that comments re-attach correctly, fuzzy matching works for long spans, and identity persists") without violating the ban on facade testing:
1. **Real DOM Execution**: `verify.js` must execute the actual `index.html` application in a real browser environment instead of parsing text.
2. **Framework Integration**: The implementer should leverage the existing `@playwright/test` dependency. `verify.js` can programmatically launch a headless Playwright browser (e.g., `chromium.launch()`) and navigate to `file://${path.resolve('index.html')}`.
3. **Behavioral Testing of Identity Persistence**: The script must interact with the `#userSwitch` dropdown, reload the page, and assert that the selected user remains active (both in the DOM's select element and `localStorage`).
4. **Behavioral Testing of Fuzzy Matching & Re-attach**: To test the fuzzy fallback natively, the script should:
   - Create a comment.
   - Click the "Edit mode" button (`#editToggle`) to enable `contentEditable`.
   - Modify the underlying text within the `#artifact` editor so that it no longer perfectly matches the quote but remains within the fuzzy threshold.
   - Toggle Edit mode off, which natively triggers the application's real `locate()` function.
   - Verify the comment card in the DOM receives the `.b-stale` badge, proving the fuzzy matcher worked within the application context.
5. **Behavioral Testing of Merge UX**: The script should click the "Re-attach" button on the stale comment, trigger the new target selection, and verify the `#mergepop` modal becomes visible by checking its actual DOM display state.

## Caveats
- Playwright requires browser binaries to be installed. The implementer might need to ensure `npx playwright install` runs before the test, or the environment must support headless browser testing.
- Programmatically simulating user text selection via Playwright can be complex. However, using the existing debug handle (`window.__spike.addText`) inside `index.html` for initial test setup is acceptable, provided the fuzzy matching and re-attachment logic is executed through standard DOM interactions (toggling edit mode).

## Conclusion
The fix strategy is to completely rewrite `verify.js` as a Playwright script. This script must load `index.html` into a headless browser and validate all acceptance criteria through genuine DOM interactions and assertions, strictly eliminating all static `html.includes()` checks and mocked functions.

## Verification Method
1. Inspect the new `spike-collab/verify.js` to confirm the absence of `fs.readFileSync`, `html.includes`, and mocked `locate`/`fuzzyFind` logic.
2. Ensure the test launches Playwright and loads `index.html`.
3. Run `node verify.js` (or the equivalent test runner command).
4. Observe that the tests pass based on actual DOM state assertions (e.g., waiting for specific UI elements or classes like `.b-stale` to appear in the browser context).
