# Handoff Report: Milestone 2.2 Test Strategy and Implementation Plan

## Observation
- The target application is located at `spike-collab/index.html`.
- **Identity & Roles**: Managed via a select dropdown (`#userSwitch`). Mentions are triggered using `@` and parse against a predefined list of members (`MEMBERS`). Mentions generate notification records that appear in the `#notif` panel when clicking the `#bell`. Per-user verdicts are recorded in `#signoff`.
- **Fuzzy Matching**: Implemented using `diff_match_patch`. When text is modified slightly, the `locate()` function returns a `stale` status, displaying a `b-stale` badge and using `CSS.highlights` (`cmt-stale`) for wavy underlines. If the difference is too large, it falls back to `orphaned`.
- **Re-attach UX**: An orphaned or stale comment displays a "Re-attach" button. Clicking this puts the application in a re-attach mode (`reattachId`). For text comments, selecting new text triggers `#mergepop`. For element comments, clicking "Pick / select..." enables `#pickToggle` mode, and clicking a new element triggers `#mergepop`. Confirming the modal updates the comment's anchor.
- **State Management**: The application state is purely frontend, heavily utilizing `localStorage` (`collab-spike-v4`, `collab-spike-v4-notif`, `collab-spike-v4-verdict`, `collab-spike-v4-artifact`).
- **Global Helpers**: For easier test setup or assertions, `window.__spike` exposes functions like `addText`, `addEl`, and state properties like `comments`.

## Logic Chain
To write effective Playwright tests for these features, we must simulate the precise user flows:
1. **Fuzzy Matching**:
   - *Test Flow*: Create a comment on a specific text passage -> Click `#editToggle` to enter `contenteditable` mode -> Slightly alter the text (e.g., change a single word) -> Toggle `#editToggle` off to save and re-render.
   - *Assertion*: The comment should still be visible but its status badge should be "stale — content changed" (`.b-stale`).
2. **Re-attach Merge UX**:
   - *Test Flow (Text)*: Create a text comment -> Edit the text heavily so it becomes orphaned (delete the paragraph) -> Toggle edit off -> Click "Re-attach" on the orphaned comment -> Select new text in the document -> The `#mergepop` modal appears -> Verify the old and new context texts -> Click `#mergeConfirm`.
   - *Assertion*: The comment's badge becomes "anchored" (`.b-anchored`) and it highlights the newly selected text.
3. **Identity & Mentions**:
   - *Test Flow (Notifications)*: Start as User A (Nirat) -> Select text and write a comment with "@Alex" (using the `#mentionbox` autocomplete) -> Switch the `#userSwitch` to User B (Alex).
   - *Assertion*: The `#bellDot` should be visible for Alex with an unread notification. Clicking `#bell` opens `#notifList` showing Nirat's mention.
   - *Test Flow (Sign-off)*: As User A, click "Approve" -> Switch to User B -> See User A's approval in the roster -> Click "Request changes" for User B.

**Technical Implementation Details**:
- **Setup/Teardown**: Because the app relies on `localStorage`, `test.beforeEach` must visit the page and evaluate `localStorage.clear()`, then reload to ensure a clean slate.
- **Text Selection**: Playwright's native `locator.evaluate` or `page.evaluate` might be needed to programmatically create DOM ranges and dispatch `mouseup` events, as simulating precise drag-selections can be flaky. Alternatively, using the `window.__spike.addText` API could bootstrap the initial comment to isolate testing to the fuzzy/re-attach logic rather than the selection logic.
- **Editing**: Use `locator.fill()` or `locator.pressSequentially()` on the `contenteditable` `#artifact` element to simulate document changes.

## Caveats
- Precise text selection using mouse actions in Playwright can be brittle. It may be necessary to write a helper function using `page.evaluate` that creates a `Selection` with a `Range` to reliably trigger the pop-up comment box or the re-attach listener.
- The `CSS.highlights` API (Custom Highlight API) is used. Playwright's Chromium engine supports it, but visual regression testing might be needed if you want to verify the wavy underlines, as extracting custom highlights via the DOM API is complex.
- The `diff_match_patch` algorithm might be sensitive to whitespace changes caused by how Playwright inputs text.

## Conclusion
The test strategy should center around three Playwright spec blocks: `fuzzy-matching.spec.ts`, `re-attach.spec.ts`, and `identity.spec.ts`. The implementation will require careful handling of `localStorage` isolation between tests, and potentially utilizing the exposed `window.__spike` helper for reliable test data setup to prevent test flakiness.

## Verification Method
- Write the Playwright test scripts.
- Run the test suite using `npx playwright test` against a local server hosting `spike-collab/index.html`.
- Verification is successful if all tests pass across different browser contexts and correctly identify the states (stale, orphaned, anchored, notifications).
