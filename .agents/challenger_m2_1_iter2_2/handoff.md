# Handoff Report

## 1. Observation
- **Fuzzy Match Truncation:** In `index.html` (lines 211-213), `fuzzyFind` uses `const pattern = quote.substring(0, 32);` and passes it to `dmp.match_main`. If `match_main` returns `-1`, the function immediately returns an orphaned state.
- **Disambiguation Fallback:** In `index.html` (lines 251-252), when `hits.length > 1`, the code scores context using strict equality: `p.endsWith(pre)` and `s.startsWith(suf)`. If both are false, `sc` is 0. The max score tracking (`if(sc>bs){bs=sc;best=h;}`) initializes `bs=-1`, meaning a score of 0 will not override `bs=0` (from the first hit).
- **Prefix `indexOf` without hint:** In `index.html` (lines 253, 256), the code uses `text.indexOf(pre)` to locate the bounds for the stale text bracket and for the fuzzy hint. It always starts searching from index 0.
- **Merge UX DOM overflow:** In `index.html` (lines 170-175, 363-369), `#mergepop` is styled with `width: 360px`, `position: fixed; top: 50%; transform: translate(-50%, -50%)`, but has no `max-height` or `overflow: auto`. The text is injected directly into `<span id="mergeNew">`.

## 2. Logic Chain
1. **Fuzzy match fails on long spans:** Because `fuzzyFind` relies exclusively on the *first 32 characters* to anchor `diff_match_patch`'s Bitap search, any edit that significantly alters the beginning of a long span will cause `match_main` to fail. The entire comment will be orphaned, even if hundreds of subsequent characters are perfectly preserved, violating the "fuzzy matching works for long spans" requirement.
2. **Silent Teleportation on Disambiguation:** If a document contains repeated text (e.g., "Vendor A" twice), and the user edits the text immediately surrounding the *second* occurrence (where a comment is anchored), the strict `endsWith`/`startsWith` context checks will yield a score of 0. The algorithm will then silently fall back to `hits[0]` (the first occurrence), violating the strict PRD rule: "Never silently re-point".
3. **Teleportation via Prefix Search:** Because `text.indexOf(pre)` searches from the beginning of the document without a location hint, if a 32-character prefix is boilerplate or repeated (e.g., a standard table row), the re-anchoring logic will teleport the comment to the *first* instance of that boilerplate in the document, rather than the true location.
4. **Merge UX Lockout:** If a user re-attaches a text comment to a very long span of text, `#mergeNew` will expand the popup vertically. Because it is fixed at `top: 50%` without a height limit, it will push the "Confirm" and "Cancel" buttons completely off the screen, preventing the user from completing the action.

## 3. Caveats
- I wrote external Javascript generators/oracles to empirically simulate the `diff_match_patch` and `locate` logic. I was unable to use the `run_command` tool to execute them natively because background permission prompts timed out, so the verification relies on strict logical tracing of the implementation.
- The cross-type re-attachment (element to text) was observed but may be an intended "emergent" feature rather than a strict bug, though it alters the expected data model.

## 4. Conclusion
**Overall risk assessment:** HIGH. 
The M2.1 implementation contains severe logical flaws in text anchoring. It violates the "works for long spans" requirement by overly truncating the fuzzy pattern, and violates the "never silently re-point" PRD rule due to brittle context scoring and zero-indexed prefix searches. The Merge UX is structurally unsafe for large selections.

## 5. Verification Method
To independently verify:
1. **Fuzzy Bug:** Add a comment to a 500-character paragraph. Edit the first 50 characters significantly in "Edit mode". Turn off Edit mode. The comment will orphan instead of matching the remaining 450 characters.
2. **Disambiguation Bug:** Add a comment to the *second* occurrence of a repeated phrase. Edit the words immediately before and after it. Turn off Edit mode. The comment will silently jump to the *first* occurrence.
3. **Merge UX Bug:** Click "Re-attach" on a comment. Select a paragraph of >1000 characters. Observe the popup expanding off-screen.
