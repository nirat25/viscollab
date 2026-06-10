# Handoff Report: M2.1 Iteration 3 (P2-T4 Collaboration Polish)

## Observation

I reviewed `failure_report_iter2.md` and investigated `spike-collab/index.html`. Here are the findings corresponding to the 4 bugs:

1. **Fuzzy Matching Logic Flaws:**
   - At line 208, `dmp.Match_Distance` is hardcoded to `1000`. If text moves further than 1000 characters, `diff_match_patch` fails to find it.
   - At line 212, `fuzzyFind` truncates the search pattern using `const pattern = quote.substring(0, 32)`. If the first 32 characters are edited, `dmp.match_main` returns `-1`.

2. **Disambiguation / Anchor Teleportation:**
   - At line 252, in the exact-match disambiguation fallback for multiple identical spans (`hits.length > 1`), `bs` (best score) starts at `-1`. If context is completely lost on all matches, their score `sc` is `0`, which is greater than `-1`. Thus, the algorithm silently chooses the first occurrence (`hits[0]`), violating the "never silently re-point" PRD rule.

3. **Merge UX State Race Condition:**
   - At lines 362-380 (`showMergePop`) and `startReattach` (line 357), there is no state reset for an already open modal. If `startReattach` is triggered for a second comment while the modal is open, `reattachId` points to the new comment. Confirming the modal then runs `reattachId=null; setPicking(false);` via closure in the selection listener (lines 394 and 421), which aborts the state of the *second* comment.

4. **Persistence Limitation:**
   - At line 462, `toggleEdit()` modifies `art.contentEditable`, but changes are never saved to `localStorage` unless `loadArtifact` is executed, meaning a user reloading mid-session loses all text edits.

## Logic Chain

1. **Fuzzy Matching:** Increasing `Match_Distance` to a large number (e.g., `100000`) removes the restriction on how far text can be moved. To fix the 32-character truncation flaw (a limit of `diff_match_patch`'s Bitap implementation), we can extract multiple 32-char chunks from the `quote` (e.g., start, middle, and end). We run `match_main` on each chunk, compute the expected `index` offset for the full quote, and evaluate the `diff_main` score. We then accept the chunk that yields the highest score.
2. **Disambiguation:** By explicitly checking if the best score `bs === 0` after looping through all hits, we can detect total context loss. Returning `{status: 'orphaned'}` in this case prevents silent teleportation.
3. **Merge Race Condition:** Enforcing a single active merge flow is the safest UX fix. `startReattach` should cancel any open merge modal (`display='none'; mergeAction=null`). Furthermore, inside the modal's confirmation callbacks (text and element selections), we should only execute `reattachId = null` if `reattachId === c.id`.
4. **Persistence:** The `contentEditable` element emits `input` events upon every keystroke. Attaching a simple `input` listener to `#artifact` that executes `localStorage.setItem(ART_KEY, art.innerHTML)` will guarantee continuous persistence across reloads.

## Caveats
- I did not execute the modified `diff_match_patch` logic in Node due to `run_command` user permission timeouts, but the algorithmic strategy correctly accounts for the library's `Match_MaxBits` limitation.
- The `input` event on `contentEditable` will save frequently, but since this is a spike without backend sync, `localStorage` performance overhead is negligible. 

## Conclusion
The bugs are fully diagnosed. The required changes should be implemented in `spike-collab/index.html` as follows:
- **Fuzzy Find:** Set `dmp.Match_Distance = 100000`. In `fuzzyFind`, test chunks `quote.substring(0, 32)`, `quote.substring(Math.floor(quote.length/2)-16, ...)`, and `quote.substring(quote.length-32)` instead of just the first 32 characters, picking the best scoring index.
- **Disambiguation:** In `locate`, add `if (bs === 0) return {status: 'orphaned'};` right before `return {status: 'anchored', start: best...}` in the multiple-hit logic block.
- **Merge UX:** Update `startReattach` to hide `#mergepop` and nullify `mergeAction` when invoked. Update the `showMergePop` confirmation closures to conditionally clear `reattachId` only if it matches `c.id`.
- **Persistence:** Add `art.addEventListener('input', () => localStorage.setItem(ART_KEY, art.innerHTML));`.

## Verification Method
1. Open `spike-collab/index.html` in a browser.
2. **Fuzzy match**: Edit the first word of a long comment's anchor and verify the comment becomes stale, not orphaned. Move a paragraph to the end of the document and verify the comment follows it.
3. **Disambiguation**: Create multiple identical paragraphs, anchor a comment to one, and delete the prefix/suffix context. Verify it goes to orphaned state.
4. **Race condition**: Start re-attach on comment A, select text, leave modal open. Start re-attach on comment B. Verify the modal closes, and you can now attach comment B successfully.
5. **Persistence**: Edit text, refresh the page, and verify the text changes are still present.
