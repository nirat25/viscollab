# Handoff Report: M2.1 Implementation Analysis

## 1. Observation
- **Orphan re-attach merge UX**: Re-attach logic is handled in `index.html:346` (for text selection) and `index.html:360` (for element click) when `reattachId` is set. It currently rebinds silently without user confirmation.
- **Fuzzy Matching**: A custom `fuzzyFind` function using Sørensen–Dice char bigrams is implemented at `index.html:200-207`. The re-anchoring logic invokes it at `index.html:234`.
- **Mock Identity**: The user identity is hardcoded to two role buttons (`Reader (Alex)` and `Author (Nirat)`) at `index.html:101-104` and managed by the `ME` constant and `setRole()` (`index.html:390`).
- **Persistence**: Data loading and saving use synchronous `localStorage` via `load()` and `save()` at `index.html:411-413`.

## 2. Logic Chain
- **Orphan re-attach merge UX**: Because re-attaching a comment to entirely new text changes its context, users need visual confirmation to ensure the new anchor is conceptually equivalent to the old one. The "merge UX" requires intercepting the `reattachId` processing to show a preview dialog comparing the `lastKnownContext` with the newly selected target text before completing the rebind.
- **Fuzzy Matching**: `diff-match-patch` provides the Bitap algorithm for robust fuzzy matching. We need to import the library and replace `fuzzyFind`. However, `match_main(text, pattern, loc)` only returns the start index of the match. To determine the correct end index and extract the modified text, we must run `diff_main` between the original quote and a substring window starting at the matched index.
- **Mock Identity & Persistence**: To support a realistic collaborative environment, the hardcoded buttons must be replaced with a generic `<select>` user-picker populated from the `MEMBERS` array (`index.html:183`). To simulate a real backend (and test loading spinners/optimistic UI), the `load()` and `save()` methods must be wrapped in `async` functions with artificial `setTimeout` delays.

## 3. Caveats
- `diff-match-patch` requires calculating the matched string's length manually if the text has insertions/deletions, because `match_main` only returns the starting offset.
- Introducing async persistence requires adding loading states to the UI and disabling interactions while data is fetching/saving to avoid race conditions.

## 4. Conclusion
**Detailed Implementation Strategy**:

1.  **Fuzzy Matching (diff-match-patch)**
    - Add `<script src="https://cdnjs.cloudflare.com/ajax/libs/diff_match_patch/20121119/diff_match_patch.js"></script>` to the `<head>`.
    - Create a global `const dmp = new diff_match_patch(); dmp.Match_Threshold = 0.5;`.
    - Replace `fuzzyFind` with a wrapper that calls `dmp.match_main(text, quote, hintIdx)`.
    - If a match is found (`index !== -1`), extract a text window (`text.substr(index, quote.length + 50)`) and use `dmp.diff_main(quote, window)` to calculate the exact end boundary and `newText`.
2.  **Orphan Re-attach Merge UX**
    - Modify the `mouseup` (text) and `click` (element) event listeners (`index.html:346` and `360`).
    - Instead of immediately rebinding, open a new popup (`#reattachPop`).
    - Display a `diff_prettyHtml` (using DMP) between `c.lastKnownContext` and the newly selected text to show what changed.
    - Provide "Confirm Merge" and "Cancel" buttons to execute or abort the re-attachment.
3.  **Mock Identity / Persistence**
    - Replace the `<div class="role">` buttons with a `<select id="userPicker">` populated dynamically from `MEMBERS`.
    - Update `setRole` to `setUser(memberId)`, modifying `ME` dynamically instead of using hardcoded Reader/Author roles.
    - Refactor `load()`, `save()`, `loadNotif()`, and `saveNotif()` into an `AsyncStore` module returning Promises (`await new Promise(r => setTimeout(r, 400))`).
    - Update UI calls to `await` the saves and show a small saving indicator in the header.

## 5. Verification Method
- **Identity**: Select a new user from the dropdown; verify that creating a new comment logs the correct user name.
- **Merge UX**: Edit the artifact text to orphan a comment. Click "Re-attach" and select new text. Verify that the confirmation popup appears, displaying the diff, and the comment only rebinding upon confirmation.
- **Fuzzy Match**: Make a moderate edit to an anchored comment's text (e.g., change multiple words). Turn Edit Mode off. Verify that the comment survives as `stale` rather than being dropped to `orphaned`, proving DMP successfully found the fuzzy match.
