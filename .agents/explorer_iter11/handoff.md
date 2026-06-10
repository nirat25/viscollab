# Handoff Report - fuzzyFind Boundary Overlap Fix (Iteration 11)

## Observation
1. The bug report in `.agents/sub_orch_m2_collab/failure_report_iter10.md` indicates that the boundary logic inside `fuzzyFind` eagerly absorbs entire insertions when a boundary deletion occurs. This causes massively unrelated insertions to be incorrectly included in the highlight.
2. The problematic logic was located in `spike-collab/index.html` at `fuzzyFind`, where `qStartOff` and `qEndOff` were updated by assigning `tPos` indiscriminately before and after insertions, or explicitly dragging `qEndOff` via `qEndCrossedInEditBlock`.
3. The previous algorithm failed to distinguish between "boundary replacements" (where a partial deletion overlaps a boundary) and "entire quote replacements" (where the whole quote is deleted).

## Logic Chain
1. The `diff_match_patch` library normalizes edits so that `op = -1` (Deletion) always precedes `op = 1` (Insertion) in a single edit block.
2. By looping over `diffs` per-block rather than per-character for insertions, we can accurately determine the mapping of boundaries:
   - For `qStart`, if it falls inside a deletion, it should map to `tPos + insLen` (the position AFTER the replacement insertion). This pushes the insertion into the **prefix**, preventing the quote from eagerly absorbing it.
   - For `qEnd`, if it falls inside a deletion, it should map to `tPos` (the position BEFORE the replacement insertion). This pushes the insertion into the **suffix**.
3. Insertions (`op = 1`) that happen exactly at the boundary without an overlapping deletion are similarly handled: an insertion precisely at `qStart` gets pushed to the prefix (`qStartOff = tPos + len`), and one exactly at `qEnd` gets pushed to the suffix (`qEndOff = tPos`).
4. **Entire Quote Replacement**: If BOTH `qStart` and `qEnd` are destroyed within the SAME edit block (i.e. the entire quote was replaced), then `qStartOff` evaluates to `tPos + insLen` and `qEndOff` evaluates to `tPos`. This naturally results in an inverted boundary `qStartOff > qEndOff`. By detecting this inversion and swapping them (`qStartOff = tPos`, `qEndOff = tPos + insLen`), the highlight perfectly spans the entire insertion, cleanly avoiding the 0-length collapse from Iteration 9.
5. The combination of these mappings perfectly isolates surviving text while precisely placing overlapping insertions outside the quote.

## Caveats
- The logic safely assumes `diff_cleanupSemantic` maintains normalized diff streams where `-1` strictly precedes `1` within merged edit blocks. This is a robust invariant in `diff_match_patch`.
- EOF and BOF edge cases are preserved by retaining the fallback boundary catches after the loop.

## Conclusion
The state machine in `fuzzyFind` has been simplified and strictly bound to boundary mapping rules based on whether `sPos === qStart` or `qEnd`. Boundary deletions correctly bypass unrelated insertions, resolving the Iteration 10 failure while keeping the Iteration 9 full-replacement fix intact via an inverted boundary swap.

## Verification Method
1. Open `spike-collab/index.html` in a browser.
2. Verify that placing a massive insertion at the exact boundary of an anchored comment does NOT absorb the insertion into the comment text.
3. Verify that replacing the *entire* comment text accurately stretches the comment highlight over the full replacement insertion.
