# Handoff: M2.1 Implementation Analysis

## Observation
I investigated `spike-collab/index.html` and `spike-collab/README.md`.
1. **Re-attach UX**: Currently, manual re-attach is triggered by clicking "Re-attach" on an orphaned comment (`startReattach(c)`). When the user subsequently makes a text selection (`mouseup`) or clicks an element (`click` while `picking` is true), the comment is immediately and silently updated (`c.target=anchor`). There is no confirmation step showing the old vs new context.
2. **Fuzzy Matching**: `fuzzyFind()` (lines 202-207) uses a custom Sørensen–Dice bigram comparison over the entire text `for(let i=0;...;i+=step)`. This is inefficient and error-prone for larger spans. The `README.md` explicitly lists replacing this with `diff-match-patch/Bitap` for longer spans as a known limit.
3. **Identity/Persistence**: Identity is hardcoded to a role toggle: `const ME = { reader:'Alex', author:'Nirat' };` (line 184). The selected role is not persisted in `localStorage`. 

## Logic Chain
To satisfy M2.1:
1. **Orphan re-attach merge UX**: The silent re-attach must be intercepted. Instead of immediately committing the change in the event listeners, we must temporarily store the new selection and open a confirmation dialog (`#mergepop`). This dialog should present a visual comparison (`c.lastKnownContext` vs `new selection`) and ask the user to explicitly confirm or cancel.
2. **Fuzzy matching using diff-match-patch**: The current custom bigram implementation must be replaced. We should load `diff_match_patch.js` via CDN. Because the DMP `match_main` algorithm has a max pattern length (Bitap 32-char limit), we must slice the first ~32 characters of `quote` to find the `start` index using `match_main()`, and then optionally use `diff_main()` or a substring comparison to score and align the full longer span at that location.
3. **Mock identity/persistence**: We must replace the hardcoded "Reader/Author" buttons with a generic user dropdown `<select>` populated from the `MEMBERS` array. The selected user ID must be stored in `localStorage` (e.g., `collab-spike-v4-user`). All usages of `ME[role]` must be replaced with `currentUser.name`. Edit mode can simply be a toggle available to the active user.

## Caveats
- `diff-match-patch`'s `match_main` will fail or truncate if the pattern exceeds 32 characters. We must handle this by matching a 32-char prefix/snippet and then validating the rest.
- For the re-attach merge UX, we should ensure that closing/cancelling the popup resets the `pendingReattach` state correctly so the user doesn't get stuck.

## Conclusion
The implementation strategy for M2.1 is:
1. **Identity**: Add a `<select id="userSwitch">` for user switching. Read/write the selected user to `localStorage`. Update `ME[role]` usages to use `currentUser.name`.
2. **Fuzzy Match**: Add the `diff_match_patch` CDN script. Rewrite `fuzzyFind(text, quote, hintIdx)` to instantiate `new diff_match_patch()`, use `match_main` on a 32-char slice of `quote`, and validate the rest of the span to determine if it meets the fuzzy threshold.
3. **Merge UX**: Add a `<div id="mergepop" class="pop">` to the DOM. When `reattachId` is active and a user selects text/element, block the immediate save, show `#mergepop` with the before/after text, and only commit `c.target` when they click "Confirm".

## Verification Method
1. Start an HTTP server (`python -m http.server 8123`) in `spike-collab` and load `index.html`.
2. **Identity**: Select a user, refresh the page, verify the user selection is remembered.
3. **Fuzzy Match**: Author a comment, then edit the artifact text slightly in the middle of the quote. Turn edit mode off. Verify the comment still re-anchors to `stale` rather than `orphaned`.
4. **Merge UX**: Break an anchor by deleting text completely (orphan it). Click "Re-attach", select new text. Verify a confirmation popup appears showing the old and new contexts before applying.
