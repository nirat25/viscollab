# Handoff Report - Disambiguation Teleportation Bug Fix Strategy

## Observation
1. **The Bug Location**: In `spike-collab/index.html`, the `fuzzyFind` function searches for `quote` in 32-character chunks using `dmp.match_main`. If the `quote` is identical in multiple places but its surrounding context (`prefix`/`suffix`) changes, the fuzzy matcher evaluates distance from `loc` (`hintIdx`).
2. **The Teleportation Cause**: When the comment's `prefix` is mutated, `text.indexOf(pre)` in `locate()` returns `-1`, passing `hintIdx = -1` to `fuzzyFind`. Inside `fuzzyFind`, `hintIdx` defaults to `loc = 0`. With `dmp.Match_Distance = 1000000`, the spatial locality constraint is basically ignored. The perfect string match at the second occurrence out-scores the mutated string match at the original occurrence.
3. **The Test Bypass**: In `spike-collab/tests/collab.spec.js`, the test `Disambiguation teleportation bug fixed for non-unique quotes` only mutates the `quote` (replacing `"Duplicated quote test."` with `"Duplicated edited quote test."`) but leaves the `prefix` perfectly intact. This allows the exact-match fallback (`if(pre&&suf)`) to find the original location, entirely bypassing `fuzzyFind`.

## Logic Chain
1. To prevent teleportation, the fuzzy matcher MUST use the highly unique surrounding context instead of just the non-unique `quote`.
2. `dmp.match_main` operates on maximum 32-character patterns. Instead of breaking `quote` into 32-char chunks, we can concatenate `full = pre + quote + suf` and break `full` into 32-char chunks to find the start of the entire block.
3. Once the start of the block is found via the unique prefix/context, we run `dmp.diff_main` on `full` against a text window.
4. By iterating over the resulting semantic diff, we can perfectly identify the `quote` bounds in the text by tracking when the pattern index (`pPos`) reaches `pre.length` and `pre.length + quote.length`.
5. The overall score is calculated as `matches / full.length`. If it matches the wrong occurrence, the missing `prefix` and `suffix` at that location will severely penalize the score below the `FUZZY_THRESHOLD` (0.6), preventing teleportation and correctly orphaning if necessary.
6. For the test to actually trigger `fuzzyFind` and verify the fix, BOTH the `prefix` and the `quote` must be mutated. We also need to explicitly assert that the re-anchored text is the *edited* quote, proving it didn't teleport to the intact duplicate.

## Caveats
- `dmp.match_main` relies on Bitap, which limits exact searching to 32 characters. Using `pre + quote + suf` ensures the initial chunks are highly unique, but if the prefix is entirely rewritten (0% match), it will fall through chunks. If it locks onto the second occurrence, the contextual penalty correctly prevents false re-anchoring.
- This strategy avoids having to store absolute `index` offsets which are fragile against large text insertions above the comment.

## Conclusion
**Strategy for `index.html`**:
1. Update `fuzzyFind` signature to: `function fuzzyFind(text, pre, quote, suf, hintIdx)`
2. Inside `fuzzyFind`, define `const full = pre + quote + suf;` and iterate over 32-character chunks of `full` instead of `quote`.
3. Diff `full` against the `windowText`.
4. Traverse the diffs array to track character boundaries. When `pPos === pre.length`, set `sOff = tPos`. When `pPos === pre.length + quote.length`, set `eOff = tPos`. Return `{ index: start + sOff, score: matches / max(full.length, windowText.length), length: eOff - sOff }`.
5. Update `locate()` to pass all context: `const f = fuzzyFind(text, pre, q, suf, hint >= 0 ? hint : -1);`

**Strategy for `spike-collab/tests/collab.spec.js`**:
1. Inject two identical quotes with explicitly verifiable prefixes: e.g. `" first prefix. Duplicated quote test. And suffix."` and `" second prefix. Duplicated quote test. And suffix."`.
2. Add the comment to the first quote.
3. Mutate both the prefix and quote of the first occurrence: `replace("first prefix.", "first mutated prefix.").replace("Duplicated quote test.", "Duplicated edited quote test.")`.
4. Assert that the comment status is `stale`, and specifically assert that `c._loc.newText === "Duplicated edited quote test."` to guarantee it didn't teleport to the other unchanged instance.

## Verification Method
- **Implementation check**: Review `fuzzyFind` implementation matches the strategy exactly.
- **Run the test suite**: `npx playwright test tests/collab.spec.js`.
- The genuine test should FAIL under the current implementation (teleporting, resulting in `newText === "Duplicated quote test."`) and PASS after the strategy is implemented.
