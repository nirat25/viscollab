# Handoff Report - Trailing Insertion Bug Fix Strategy

## Observation
- In `spike-collab/index.html` within the `fuzzyFind` function, the logic mapping the end of the quote boundary is `if (sPos === qEnd) qEndOff = tPos;`.
- Because `sPos` pauses during insertions (`op === 1`), if an insertion occurs immediately after the quote (a trailing insertion), `sPos` remains exactly equal to `qEnd`. Consequently, `qEndOff` continuously tracks `tPos` through the insertion, erroneously absorbing the newly inserted text into the comment highlight (Trailing Insertion Bug).
- The iterative instructions require the fix to ignore trailing insertions but still capture replacement text within the quote boundary.
- In `diff-match-patch`, a replacement is represented sequentially as a deletion (`op === -1`) followed immediately by an insertion (`op === 1`). A pure trailing insertion consists of an insertion (`op === 1`) that follows a match (`op === 0`).

## Logic Chain
1. We only want to advance `qEndOff` during an insertion (`op === 1`) at the quote boundary (`sPos === qEnd`) if that insertion is part of a replacement that overlaps the end of the quote.
2. We can differentiate a replacement from a pure trailing insertion by tracking the previous diff operation chunk. If the previous operation was a deletion (`-1`), the current insertion is replacing text that ended at `qEnd` (part of the quote). If the previous operation was a match (`0`), the quote matched perfectly and the insertion is strictly trailing.
3. By declaring a variable (e.g., `let prevOp = 0;`) before the outer `diffs` iteration loop and updating it (`prevOp = op;`) at the end of each diff chunk, we can track the type of the preceding chunk.
4. We can safely refine the `qEndOff` update condition to:
   `if (sPos === qEnd && (op !== 1 || prevOp === -1)) qEndOff = tPos;`
5. This mirrors the safety mechanism of `qStartOff` (`op !== 1`), effectively halting `qEndOff` advancement on pure trailing insertions, while providing a clean escape hatch (`prevOp === -1`) to accurately capture replacements.

## Caveats
- This assumes `diff-match-patch` consistently groups replacements as a deletion followed by an insertion (`-1` then `1`), which is standard for its `diff_cleanupSemantic` behavior.
- We must track `prevOp` at the chunk level (outer loop), not the character level (inner loop), since an insertion chunk's characters all have `op === 1`.

## Conclusion
Implement the tracked `prevOp` pattern in `fuzzyFind`. Define `let prevOp = 0;` before the `diffs` loop, update `qEndOff` using `if (sPos === qEnd && (op !== 1 || prevOp === -1)) qEndOff = tPos;`, and assign `prevOp = op;` at the end of the outer loop. This perfectly balances ignoring trailing insertions while preserving quote replacements.

## Verification Method
1. Open `spike-collab/index.html` in a browser.
2. Create a comment on a word (e.g., "Analytics").
3. Enter Edit mode and insert text immediately after the word (e.g., "AnalyticsXXX"). Exit Edit mode; the comment highlight should only cover "Analytics" (Trailing Insertion ignored).
4. Enter Edit mode and replace the end of the word (e.g., replace "tics" with "XXXX" to make "AnalyXXXX"). Exit Edit mode; the highlight should cover the entire "AnalyXXXX" (Replacement captured).
