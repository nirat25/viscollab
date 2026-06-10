# Failure Report - M2.1 Iteration 6

## Summary
The iteration failed because the worker's fix for the Disambiguation Teleportation Bug introduced a new bug in `fuzzyFind`.

## Verified Findings
1. **Mis-highlighting Bug (Boundary Mapping)**: The boundary mapping for `qStartOff` and `qEndOff` in `fuzzyFind` ignores insertions (`op === 1`). When the quote is replaced, the bounds skip the replacement text, resulting in `qStartOff === qEndOff` and a length of `0`.
2. **Mis-highlighting Bug (Falsy Fallback)**: In `locate()`, the fallback `f.length || q.length` treats `0` as falsy, defaulting to `q.length` and incorrectly highlighting `q.length` characters starting at the boundary index (mis-highlighting the suffix).

## Instructions for Next Iteration (Iteration 7)
1. **Fix Boundary Mapping**: Update `fuzzyFind` in `index.html` to correctly map `qStartOff` and `qEndOff` to include inserted text that replaces parts of the quote, so that `f.length` accurately reflects the length of the new replacement text.
2. **Fix Falsy Fallback**: In `locate()`, update `f.length || q.length` to use nullish coalescing (`f.length ?? q.length` or similar) so that a valid `0` length doesn't default to `q.length`. Or, handle length `0` explicitly (e.g. by marking it stale with 0 length or orphaning it).
3. Ensure the Disambiguation Teleportation Bug and Dummy Test remain fixed.
