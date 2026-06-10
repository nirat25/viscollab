# Handoff Report - M2.1 Iteration 9 Fix Strategy

## Observation
Analysis of the `fuzzyFind` loop logic for the `sPos` tracking and boundary detection reveals two precise structural flaws corresponding to the iteration 8 failure report:
1. **EOF Replacements**: The loop contains an early termination condition: `if (sPos >= searchStr.length && op !== 1) { done = true; break; }`.
2. **BOF Replacements**: The exact placement of the `sPos === qStart` check relative to the `sPos++` increment determines whether boundary index `0` is captured.

## Logic Chain
1. **EOF Bug**: When a replacement occurs at the absolute end of the file (`suf` is empty), the search string ends in a deletion (`op === -1`). As `sPos` increments, it reaches `searchStr.length`. The condition `op !== 1` evaluates to true, causing an immediate `break`. This completely skips the partnered `op === 1` chunk (the actual replacement text) that follows, meaning `qEndOff` fails to absorb the insertion. 
2. **BOF Bug**: `qStartOff` represents an inclusive start index, while `qEndOff` is an exclusive end index. This requires asymmetrical evaluation. If the `qStart` check occurs *after* `sPos` increments, the first character transitions `sPos` from `0` to `1`. Thus, the check `sPos === 0` is entirely bypassed for BOF replacements, leaving `qStartOff` unset.
3. **Robust Solution**: 
   - Deleting the EOF early break is safe because the `diffs` array is naturally bounded by the small text `margin`. The `qEndOp === -1` guard ensures only valid replacements are absorbed.
   - For BOF, strict separation of evaluations is required: `qStartOff` must be checked *before* increments, and `qEndOff` *after*.

## Caveats
- By removing the early break, the loop will process all trailing chunks up to the text margin. The existing `qEndOp === -1` validation is relied upon to prevent unrelated trailing insertions from extending the highlight incorrectly. 

## Conclusion
The Implementer Worker must execute the following strategy in `spike-collab/index.html`:
1. **Remove EOF Break**: Completely delete the `if (sPos >= searchStr.length ...) break;` block and the `done` flag to allow trailing EOF insertions to process.
2. **Enforce Asymmetrical Indexing**: 
   - Place the `qStartOff` check (`if (sPos === qStart && qStartOff === -1 && op !== 1) qStartOff = tPos;`) at the **absolute top** of the inner `i` loop, *before* `sPos++`.
   - Place the `qEndOff` check (`if (sPos === qEnd) ...`) at the **bottom** of the inner `i` loop, *after* `sPos++`.
3. Retain all previous fixes (`qEndOp` assignment, Disambiguation Teleportation, Falsy Fallback).

## Verification Method
- Inspect `spike-collab/index.html` to confirm the `qStartOff` conditional is evaluated prior to any `op` evaluations that increment `sPos`, and that no early `break` truncates trailing insertions.
- Run the designated M2.1 Playwright tests validating fuzzy re-attach on edge cases. No orphaned highlights should occur at index 0 or at the EOF boundary.
