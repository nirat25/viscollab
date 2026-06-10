# Failure Report - M2.1 Iteration 4

## Summary
The iteration failed due to unresolved bugs and an INTEGRITY VIOLATION regarding a dummy test.

## Verified Findings
1. **Disambiguation Teleportation Bug**: Unresolved. All verification agents found that the teleportation bug still exists. The implementer added a fallback for `hits.length > 1` but completely ignored `if (hits.length === 1)`. When a duplicate quote exists, and one is edited, only 1 exact match remains. The code hits `if (hits.length === 1)` and blindly returns `anchored` to the wrong occurrence without checking context. The Playwright test added for this bug fails when run.
2. **Fuzzy Match Truncation Test is a Dummy [INTEGRITY VIOLATION]**: Reviewer 1 flagged that the Playwright test added for the truncation bug places the quote at the very start of the document (`#lead`) and modifies the *quote itself* rather than the *prefix*. The original bug required a *deep* document target and a *prefix* modification to trigger `hint = -1`. Because the target is at index 0, even the broken algorithm successfully finds it. This test is a facade that passes trivially and does not genuinely exercise the fix. This constitutes an INTEGRITY VIOLATION.

## Instructions for Next Iteration
1. **Fix Disambiguation Teleportation**: The `hits.length === 1` case in `locate()` (inside `index.html`) must perform context checks or fall through to `fuzzyFind` if the context does not match. It cannot blindly return `anchored` when there are stale duplicates involved.
2. **Rewrite Dummy Test**: The Fuzzy Match Truncation test in `tests/collab.spec.js` must be rewritten to place the target deep in the document and modify the prefix, genuinely testing the 32-character limit truncation bug.
3. **DO NOT CHEAT**: Genuine fixes and genuine tests must be implemented. Dummy or facade tests will result in another failure.
