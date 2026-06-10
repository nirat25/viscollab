# Observation

1. **Mock Identity:** `index.html` handles identity via two hardcoded buttons (`#roleReader` and `#roleAuthor`) toggling between `reader` (Alex) and `author` (Nirat) without `localStorage` persistence. The `MEMBERS` array has 4 users total.
2. **Fuzzy Matching:** Currently implemented in `index.html` (lines ~200-207) using a manual Sørensen-Dice coefficient on character bigrams (`bigrams`, `dice`, `fuzzyFind`).
3. **Orphan Re-attach Merge UX:** The `startReattach` flow (lines ~339-347) listens for `mouseup`, extracts the text selection, and silently overwrites `c.target = anchor` and `c.lastKnownContext = anchor.quote`. No visual confirmation or "merge" diff is shown.
4. **diff-match-patch:** The library is not yet imported. The research doc (`docs/comment-lifecycle-research.md`) mentions `diff-match-patch` natively supports fuzzy anchoring and visual diffs.

# Logic Chain

1. **Mock Identity / Persistence:** To meet M2.1, the mock identity should support all users in `MEMBERS` and persist across reloads. Replacing the hardcoded buttons with a `<select>` dropdown, and storing the selected `userId` in `localStorage` resolves this.
2. **Fuzzy Matching for Longer Spans:** The manual bigram logic fails on longer spans. We should import `diff_match_patch.js` from a CDN (e.g., `https://cdnjs.cloudflare.com/ajax/libs/diff_match_patch/20121119/diff_match_patch.js`). We can replace the `fuzzyFind` function to instantiate `new diff_match_patch()`, configure `Match_Threshold` and `Match_Distance`, and call `dmp.match_main(text, quote, hintIdx)` to locate the start index.
3. **Orphan Re-attach Merge UX:** When manually re-attaching a comment to new text, reviewers need to see how the context changed. Using `dmp.diff_main(c.lastKnownContext, anchor.quote)` followed by `dmp.diff_prettyHtml(diffs)` will generate an HTML diff. We can inject this into a new confirmation popup (`#mergebox`) so the user can review the "merge" before confirming the re-attach.

# Caveats

- `diff-match-patch`'s `match_main` returns a start index. If the text has been edited (insertions/deletions), `quote.length` may not perfectly slice the new text. The implementation may just slice `text.slice(index, index + quote.length)` as an approximation, or run a bounded `diff_main` to find the exact end index.
- Ensure the `<select>` for identity maintains compatibility with the existing `role` variable or updates the system to use the selected `member.id` globally.
- Ensure styling (like `<ins>` and `<del>`) is provided for `dmp.diff_prettyHtml` output in the merge popup.

# Conclusion

The Implementer should:
1. Add `<script src="https://cdnjs.cloudflare.com/ajax/libs/diff_match_patch/20121119/diff_match_patch.js"></script>` to `index.html`.
2. Refactor the identity UI into a dropdown `<select>` over `MEMBERS`, saving to `localStorage`.
3. Replace `bigrams`, `dice`, and `fuzzyFind` with `dmp.match_main` logic.
4. Add a `#mergebox` HTML popup. In the `mouseup` re-attach handler, intercept the silent save, run `dmp.diff_main(old, new)` and `diff_prettyHtml()`, display the diff in `#mergebox`, and perform the save only when "Confirm" is clicked.

# Verification Method

- Serve the page `python -m http.server 8123 --directory spike-collab`.
- Change identity via dropdown, refresh the page, verify identity persists.
- Create a text comment, click "Edit mode", heavily mutate the text, turn Edit mode off, and verify it goes `stale` rather than orphaned (confirming `dmp.match_main` works).
- Click "Re-attach" on an orphaned comment, select new text, and verify a merge confirmation popup appears displaying visual diffs (green/red or strike/underline) of the text change.
