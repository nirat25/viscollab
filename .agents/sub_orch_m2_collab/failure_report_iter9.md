# Failure Report - M2.1 Iteration 9

## Summary
The iteration failed because Challenger 1 discovered an Overlapping Replacements Bug in the `fuzzyFind` logic, even though EOF/BOF boundaries are now functional.

## Verified Findings
1. **Overlapping Replacements Bug**: If a user replaces a text segment that swallows both the quote AND part of the suffix (e.g., selecting "He", but replacing the whole word "Hello" with "Hi"), the deletion diff chunk increments `sPos` past `qEnd`. When the subsequent insertion chunk (`op === 1`) is processed, the required gating condition `sPos === qEnd` evaluates to false. This causes the insertion to be dropped entirely, collapsing the highlight into a 0-length anchor.
2. The previous boundary fixes (EOF, BOF, Trailing Insertions `qEndOp`, Falsy Fallback, and Disambiguation Teleportation) are correct but insufficient for overlapping deletions that push `sPos` past `qEnd`.

## Instructions for Next Iteration (Iteration 10)
1. **Fix Overlapping Replacements Bug**: Update the boundary checks for `qEndOff` in `fuzzyFind`. The check `sPos === qEnd` is too brittle if `sPos` can jump past `qEnd` during a deletion chunk. Consider tracking if `sPos >= qEnd` and whether the boundary was crossed within the current chunk.
2. Ensure all previous fixes remain fully intact.
