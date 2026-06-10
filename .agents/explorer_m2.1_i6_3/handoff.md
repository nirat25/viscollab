# Handoff Report: Disambiguation Teleportation Bug Analysis

## 1. Observation
1. In `spike-collab/tests/collab.spec.js`, the test `Disambiguation teleportation bug fixed for non-unique quotes` replaces `"Duplicated quote test."` with `"Duplicated edited quote test."` without altering the surrounding text.
2. In `spike-collab/index.html`, the `locate` function extracts a `prefix` (up to 32 chars before the quote). It includes a fast-path fallback for edited quotes: `if(pre&&suf){ const pi=text.indexOf(pre); ... if(si!==-1&&si-ap<=STALE_WINDOW) return {status:'stale',...}; }`. Because the test did not mutate the prefix, the code successfully re-anchors using this block and entirely bypasses the fuzzy matcher (`fuzzyFind`).
3. If the fuzzy matcher *is* reached (by mutating the prefix), `fuzzyFind` searches using `dmp.match_main(text, pattern, loc)`. `dmp.Match_Distance` is set to `1000000`. Since the second occurrence of the duplicate quote remains perfectly unmodified, it scores `1.0` (edit distance 0), completely overwhelming any location-distance penalty, and teleporting the comment to the wrong occurrence.

## 2. Logic Chain
1. The Playwright test is a dummy facade because modifying *only* the quote leaves the exact prefix intact. The `locate` function uses the intact prefix to re-anchor without invoking the fuzzy tier.
2. For the test to genuinely trigger the fuzzy tier, it must mutate the prefix alongside the quote, causing `text.indexOf(pre)` to fail or the `pre&&suf` exact-match block to fail.
3. When the fuzzy matcher is genuinely invoked, teleportation occurs because `fuzzyFind` currently only searches for the `quote`. The unmodified duplicate quote located elsewhere acts as an irresistible perfect match.
4. To fix the teleportation bug in the fuzzy tier, the matcher must search for a context-aware string (`prefix + quote + suffix`) rather than just the `quote`. A partially matching context around the correct occurrence will score higher than a perfectly matching quote surrounded by completely incorrect context at the teleportation site.

## 3. Caveats
No caveats. The fix requires altering both the application code's fuzzy matching strategy and the test's mutation payload. The exact string manipulation in the new context-aware `fuzzyFind` will require careful index offsets when mapping the diff back to the text to correctly isolate just the `quote` part from the overall matched `prefix + quote + suffix` block.

## 4. Conclusion
The M2.1 Iteration 5 failure is due to a dummy test that bypassed the fuzzy tier entirely, masking the persistent teleportation bug within `fuzzyFind`. The fix requires updating `fuzzyFind` to use a context-aware search string (`pre + q + suf`) to leverage context during fuzzy scoring, and rewriting the test mutation to break both the quote and the 32-char prefix to genuinely invoke the fuzzy tier.

## 5. Verification Method
1. Update `tests/collab.spec.js` to replace both the prefix and quote: e.g., `document.querySelector('#lead').innerHTML.replace("covers every current use case. Duplicated quote test.", "covers NO current use case. Duplicated edited quote test.");`
2. Implement the contextual fuzzy matcher in `index.html`.
3. Run `npx playwright test collab.spec.js`.
4. The test should pass, and the comment should highlight the modified quote in `#lead` instead of teleporting to `#why`.

## Remaining Work
The implementing agent must:
1. Rewrite `fuzzyFind` in `index.html` to construct `const searchStr = (pre||"") + q + (suf||"")` and diff this entire context string. Use `diff_main` to isolate the `q` boundaries within the matching window text, ensuring the score incorporates the matches of `pre` and `suf`. Update the call site in `locate()` to pass `pre` and `suf` to `fuzzyFind`.
2. Update the dummy test in `spike-collab/tests/collab.spec.js` as detailed above to mutate both the prefix and the quote.
