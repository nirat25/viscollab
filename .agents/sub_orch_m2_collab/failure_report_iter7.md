# Failure Report - M2.1 Iteration 7

## Summary
The iteration failed because Reviewer 1 discovered a "Trailing Insertion Bug" introduced by the new diff-boundary logic in `fuzzyFind`.

## Verified Findings
1. **Trailing Insertion Bug**: The updated `qEndOff` logic (`if (sPos === qEnd) qEndOff = tPos;`) is too greedy. If a user inserts text immediately after the quote (a trailing insertion where `op === 1`), `sPos` remains equal to `qEnd`. The `qEndOff` variable continuously tracks `tPos` and absorbs the newly inserted text. As a result, the comment highlight erroneously leaks into the suffix.
2. The `0 ?? q.length` falsy fallback fix in `locate()` is correct.

## Instructions for Next Iteration (Iteration 8)
1. **Fix Trailing Insertion Bug**: Update the `qEndOff` mapping in `fuzzyFind` (`index.html`) so that it includes replacement text but ignores trailing insertions. Consider a condition that halts the advancement of `qEndOff` if the insertion is strictly trailing, similar to how `qStartOff` correctly skips leading insertions (`&& op !== 1`).
2. Ensure the Disambiguation Teleportation Bug, the Dummy Test fix, and the Falsy Fallback fix remain intact.
