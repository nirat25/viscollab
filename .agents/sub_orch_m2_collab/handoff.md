# Handoff Report - Overlapping Replacements Bug

## Observation
The bug report states that during an overlapping deletion (e.g., quote="He", replacement="Hi" for the word "Hello"), the deletion diff chunk causes `sPos` to increment past `qEnd`. When the subsequent insertion chunk (`op === 1`) is processed, the gating condition `if (sPos === qEnd)` evaluates to false. This skips the insertion, failing to include it in the `qEndOff` calculation and collapsing the highlight into a 0-length anchor (or dropping the inserted text entirely).

## Logic Chain
1. In `fuzzyFind`, the inner loop processes diff chunks character by character. `sPos` strictly tracks the original text length.
2. The condition `if (sPos === qEnd)` is only true at the exact moment `sPos` reaches the quote's boundary.
3. If a deletion chunk (`op === -1`) crosses `qEnd`, `sPos` hits `qEnd`, setting `qEndOff` to the current `tPos`. However, the deletion continues, and `sPos` keeps incrementing until `sPos > qEnd`.
4. When the next chunk is the corresponding insertion (`op === 1`), `sPos` does not change, but it is already `> qEnd`. The code skips over `if (sPos === qEnd)`, meaning `qEndOff` is never updated to include the inserted text.
5. To fix this robustly, we must track whether the boundary was crossed within the *current edit block* (a contiguous sequence of `-1` and `1` chunks without `0` chunks).
6. By tracking `inEditBlock` and `qEndCrossedInEditBlock`, we can identify insertions that belong to a replacement block that swallowed `qEnd`.
7. For these insertions, we can add an `else if (sPos > qEnd && op === 1 && qEndCrossedInEditBlock)` condition to continuously push `qEndOff = tPos` to the end of the insertion.
8. This safely extends the quote boundary to encompass the replacement without modifying or breaking any of the existing `sPos === qEnd` checks (which correctly handle exact-match and trailing insertion edge cases). `qStartOff` already behaves correctly because its check happens *before* `sPos` and `tPos` advance during an edit block.

## Caveats
- We assume `diff_match_patch` merges adjacent replacements into a single contiguous edit block (which it generally does, typically ordering `-1` then `1`).
- The fix only targets `qEnd`. `qStart` naturally captures the insertion because its check `if (sPos === qStart && op !== 1)` sets `qStartOff` to the `tPos` *before* the insertion block, effectively expanding the quote to include it.

## Conclusion
Implement an edit block tracking state (`inEditBlock`, `qEndCrossedInEditBlock`) outside the diff loop. Reset it to false when `op === 0`, and set `inEditBlock = true` otherwise. Flag `qEndCrossedInEditBlock = true` if `sPos === qEnd` occurs during an `op === -1` inside the block. Then add an `else if (sPos > qEnd && op === 1 && qEndCrossedInEditBlock)` branch that updates `qEndOff = tPos`. This preserves all previous boundary rules while fixing the overlapping replacements flaw.

## Verification Method
Test the `fuzzyFind` behavior using:
- `text`: "Hello" (original), replaced with "Hi"
- `q`: "He", `pre`: "", `suf`: "llo"
Verify that `fuzzyFind` produces a `length` of 2 (representing "Hi") rather than 1, correctly stretching the quote to encapsulate the inserted boundary. Verify existing tests (EOF, BOF, Trailing insertions) still pass.
