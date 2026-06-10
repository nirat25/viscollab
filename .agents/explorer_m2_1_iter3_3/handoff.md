# Handoff Report

## Observation
1. **Fuzzy Matching Logic Flaws**:
   - `index.html:212` uses `const pattern = quote.substring(0, 32);`, which restricts the fuzzy search strictly to the first 32 characters of the quote.
   - `index.html:208` sets `dmp.Match_Distance = 1000;`, applying a heavy penalty to any matches located far from the expected position.
2. **Disambiguation / Anchor Teleportation**:
   - `index.html:252` sets `best=hits[0], bs=-1` and scores occurrences by prefix/suffix match. If all matches score `0` (meaning context completely failed to match), the loop finishes with `bs=0` and silently returns `{status:'anchored', start:best...}`, incorrectly binding to the first occurrence.
3. **Merge UX State Race Condition**:
   - `index.html:372` in `mergeCancel.onclick` unconditionally executes `reattachId = null;`.
   - `index.html:394` and `index.html:421` in the `showMergePop` confirmation callbacks also unconditionally execute `reattachId = null;`.
   - If a user triggers a second re-attach while the modal is open, the global `reattachId` is reassigned. The pending modal operations will inappropriately clear the new `reattachId`.
4. **Persistence Limitation**:
   - `index.html:462` in the `toggleEdit` function toggles the `contenteditable` state, but does not save `art.innerHTML` to `localStorage` when switching back to reading mode.

## Logic Chain
1. **Fuzzy Matching**:
   - The Bitap algorithm in `diff_match_patch` has a hard limit of 32 characters. To bypass this while remaining resilient to edits at the start of the quote, `fuzzyFind` can loop through the `quote` in overlapping chunks (e.g., 32 characters at a time), calling `match_main` on each chunk until a match is found. We can subtract the chunk's offset from the match index to infer the start of the full quote, creating an accurate window for the `diff_main` evaluation.
   - Increasing `dmp.Match_Distance` to a much larger value (e.g., `100000`) removes the harsh penalty for matches far from the expected index, successfully allowing `match_main` to find paragraphs that have been moved across large documents.
2. **Disambiguation**:
   - To enforce the "never silently re-point" PRD rule, the multiple-hits resolution logic must require a strictly positive score (`bs > 0`). If `bs === 0`, it indicates total loss of surrounding context, and the logic should fall through to the fuzzy tier or directly return `orphaned`.
3. **Race Condition**:
   - To prevent modals from clearing a reassigned workflow, the cancel and confirm handlers should be bound to the specific comment ID that triggered the modal. They should only execute `reattachId = null` if `reattachId === modalCommentId`. Alternatively, calling `startReattach` can immediately close any open `mergepop` modals.
4. **Persistence**:
   - Because `index.html:499` already restores `art.innerHTML` from `localStorage.getItem(ART_KEY)` on load, simply adding `localStorage.setItem(ART_KEY, art.innerHTML);` into the `else` block of `toggleEdit()` (when `editing` becomes `false`) will persist the document edits across page reloads.

## Caveats
- Iterating chunks with `match_main` could yield a false positive location if a chunk contains highly generic text (e.g., " and the "). However, since this merely seeds the 100-character window for `diff_main`, `diff_main` will correctly compute a low final semantic score and reject the false positive.
- Persisting the artifact only when `toggleEdit(false)` is invoked means edits are lost if the user refreshes the page while still in active edit mode. This is acceptable for a spike implementation.

## Conclusion
- **Fuzzy Match Truncation**: Update `fuzzyFind` to split the `quote` into 32-character chunks, testing each with `match_main` to infer the diff window location.
- **Match Distance**: Increase `dmp.Match_Distance = 100000`.
- **Disambiguation**: In `locate()`, only return an exact match for multiple hits if the context score `bs > 0`.
- **Merge UX Race Condition**: Add ID validation before clearing `reattachId` in modal callbacks, or force-close the modal in `startReattach()`.
- **Persistence**: Add `localStorage.setItem(ART_KEY, art.innerHTML)` when exiting edit mode in `toggleEdit()`.

## Verification Method
1. Modify `spike-collab/index.html` with the proposed strategies.
2. **Fuzzy Truncation**: Add a comment to a long paragraph. Edit the first 32 characters heavily. Verify the comment degrades to `stale` rather than `orphaned`.
3. **Match Distance**: Move the commented paragraph to the bottom of the document. Verify the comment finds its target and goes `stale`.
4. **Disambiguation**: Duplicate a paragraph so it appears twice. Modify the context words before and after both instances. Verify the comment drops to `orphaned` instead of teleporting to the first instance.
5. **Race Condition**: Click "Re-attach" on comment A, then "Re-attach" on comment B without closing the modal. Cancel the modal. Verify comment B remains in pick-mode.
6. **Persistence**: Enter edit mode, type new text, exit edit mode, and refresh. Verify the new text persists.
