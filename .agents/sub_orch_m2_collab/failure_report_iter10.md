# Failure Report - M2.1 Iteration 10

## Summary
The iteration failed because Challenger 2 identified that the edit block boundary algorithm is too eager. While it fixes the 0-length collapse from Iteration 9, it improperly absorbs entire insertions into the quote boundaries (`qStartOff` and `qEndOff`) when those boundaries overlap with a deletion.

## Verified Findings
1. **Overlapping `qStart`**: When a deletion crosses `qStart`, `qStartOff` is eagerly set to `tPos` before the insertion. Any subsequent insertion in that edit block is entirely absorbed into the quote match.
2. **Overlapping `qEnd`**: The Iteration 10 fix explicitly drags `qEndOff` to the end of the insertion via `qEndCrossedInEditBlock`.
3. If a boundary deletion is replaced by a massive insertion, the comment highlight spans the entire unrelated insertion. Challenger 2 flags this as a logic bug ("state machine eagerly drags boundaries across insertions").
4. Challenger 1 considered this greedy inclusion a "sensible heuristic", but Challenger 2's point about excessively large blocks of unrelated inserted text is valid and constitutes a failure.

## Instructions for Next Iteration (Iteration 11)
1. **Refine Boundary Crossing**: The algorithm must handle overlapping replacements without collapsing to 0-length (Iteration 9 bug), but also without greedily absorbing the entire insertion (Iteration 10 bug).
2. Insertions that occur exactly on the boundary of a quote should ideally be pushed outside the quote (into the prefix or suffix) rather than absorbed into the highlight, unless the entire quote is being replaced.
3. Propose a more precise mapping for `qStartOff` and `qEndOff` that avoids swallowing large unrelated insertions at the boundaries.
