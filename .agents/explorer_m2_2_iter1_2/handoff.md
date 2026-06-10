# Observation
1. **Current Codebase State**:
   - The collaboration app (`spike-collab/index.html`) correctly implements elements like `.cmt` for comments, `.b-stale`, `.b-orphaned`, `.b-anchored` for statuses, `#mergepop` for the re-attach modal, `#bell` and `#bellDot` for notifications, and `#signoff` for document-level verdicts.
   - The current testing file (`tests/collab.spec.js`) is out of sync with the actual DOM classes. For example, it attempts to locate comments using `.comment` instead of `.cmt`.
   - The scope document (`SCOPE.md`) for M2.2 demands Playwright/browser tests specifically covering: "re-attach", "fuzzy matching", and "identity".

2. **Re-Attach Mechanics**:
   - Initiated by clicking the "Re-attach" button inside a comment's `.actions` container.
   - The user then selects new text (for text targets) or clicks an element (for element targets).
   - The `#mergepop` modal appears to confirm the change.
   - Confirming `#mergeConfirm` updates the anchor and history. Canceling with `#mergeCancel` aborts the operation.

3. **Fuzzy Matching Mechanics**:
   - Uses `diff_match_patch`. 
   - When text changes slightly but remains above the `FUZZY_THRESHOLD` (0.6), the `anchorStatus` becomes `stale`. It shows a `.b-stale` badge, rather than becoming `orphaned`.

4. **Identity Mechanics**:
   - Persists via `#userSwitch` (localStorage key `collab-user`).
   - Mentioning (`@Name`) populates `#mentionbox`.
   - Mentions generate notifications for the target user, lighting up `#bellDot`.
   - `#signoff` buttons update per-user verdicts (e.g., Approve, Request changes) in localStorage `collab-spike-v4-verdict`.

# Logic Chain
To fulfill Milestone 2.2, the Playwright tests must comprehensively cover these three areas while relying on accurate DOM selectors.

1. **Fix Existing Selectors**: 
   - Replace `.comment` with `.cmt`.

2. **Test Strategy - Re-Attach**:
   - **Text target**: Create a text comment -> modify text to drop match below threshold (making it `orphaned`) -> click `Re-attach` -> select new text -> confirm in `#mergepop` -> verify `anchored` status and updated `quote`.
   - **Element target**: Create an element comment -> delete element to orphan it -> click `Re-attach` -> click new element -> confirm -> verify `anchored`.

3. **Test Strategy - Fuzzy Matching**:
   - Create a text comment -> modify text lightly (e.g., spelling error or add a word) -> exit edit mode -> verify comment is `stale` (has `.b-stale` class) and not orphaned.

4. **Test Strategy - Identity & Multi-User flows**:
   - **Persistence**: Change user, reload, verify user persists.
   - **Mentions & Notifications**: As User A, create a comment mentioning `@Alex` -> switch to User B (`Alex`) -> verify `#bellDot` is visible -> open `#bell` and verify notification content -> notification goes away.
   - **Sign-offs**: User A clicks "Approve" -> switch to User B -> click "Request changes" -> verify `.so-roster` text correctly attributes "Approve" to User A and "Request changes" to User B.

# Caveats
- Playwright tests interact with `window.getSelection()` for text selection. Emulating text selection in Playwright can be flaky, so `page.evaluate()` may be needed to artificially create ranges and trigger the `mouseup` event on the document, similar to how it's handled in real user interactions.
- The `index.html` file relies heavily on `localStorage`. The `beforeEach` hook must clear localStorage and reload to ensure test isolation.

# Conclusion
The test strategy requires refactoring `collab.spec.js` to fix invalid DOM selectors (`.comment` -> `.cmt`), then adding/expanding 4-5 test blocks to thoroughly exercise the Re-Attach (merge UX), Fuzzy Matching (stale status), and Identity (notifications, mentions, sign-off) workflows.

# Verification Method
1. The implementer will write the tests based on this plan.
2. Verify by running `npm test` inside `spike-collab`. All tests must pass in Chromium/WebKit/Firefox.
3. Check `test-results/` to ensure no lingering failures.
