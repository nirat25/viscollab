# Handoff Report - M2.1 Iteration 5 Explorer

## Observation
1. **INTEGRITY VIOLATION / Dummy Test**: In `tests/collab.spec.js`, the test `'Fuzzy matching correctly handles truncation bug (prefix-modification)'` targets `#lead` (index 0) and modifies the quote itself `replace("Recommendation: ", "Rec: ")` without touching the prefix. As stated in the failure report, `fuzzyFind` searches at `loc = 0` when the prefix is modified (`hintIdx = -1`). A target at index 0 allows the test to pass trivially even if the old 32-character truncation bug was present.
2. **Disambiguation Teleportation Bug**: In `index.html`, the `locate()` function blindly anchors unique exact matches: `if(hits.length===1) return {status:'anchored',start:hits[0],end:hits[0]+q.length};`. If a duplicate quote exists (e.g. at index 100 and 500), and the one at index 100 is edited, `hits.length` becomes `1` (finding only the index 500 occurrence). The function returns `anchored` to index 500 without verifying if the prefix/suffix context matches, causing the comment to teleport.

## Logic Chain
1. **Fixing Teleportation**: To prevent teleportation, the `hits.length === 1` condition must not blindly return `anchored`. It needs to be merged with the `hits.length > 1` logic. By iterating over `hits` (even if there is only 1) and calculating the context score `bs = (p===pre?pre.length:0)+(s===suf?suf.length:0)`, we can verify the match. If `bs === 0` (meaning neither the prefix nor suffix matches), the single hit is likely a stale duplicate. The code should fall through to the `pre && suf` block, which will correctly identify the edited original text and mark it `stale`.
2. **Fixing the Dummy Test**: To genuinely test the 32-character truncation fix, `fuzzyFind` must be exercised at a deep document index with `hintIdx = -1`. To achieve this, the test must:
   - Target a quote longer than 32 characters deep in the document (e.g., `"Waiting another cycle compounds the overlap cost and the maintenance burden of three integrations."` in `#why`).
   - Modify the prefix to force `hintIdx = -1` (breaking exact context location).
   - Modify the start of the quote (e.g., `"Waiting"` -> `"Delaying"`) to ensure `hits.length === 0` (forcing fallback to `fuzzyFind`) and to distort the first 32-character chunk, validating that the new `fuzzyFind` correctly relies on subsequent chunks.

## Caveats
- If a user legitimately moves a unique quote to a completely new section of the document, `bs` will be `0` and it will be marked `stale` rather than `anchored`. This is actually preferred UX, as it alerts the user that the surrounding context has completely changed.
- Modifying only the prefix in the test is not enough to test `fuzzyFind`, because `hits.length === 1` (with `bs > 0` since the suffix still matches) would instantly anchor. Both the prefix and the quote must be modified.

## Conclusion
**Strategy for Disambiguation Teleportation**:
Modify `locate()` in `index.html` to merge `hits.length === 1` and `hits.length > 1`:
```javascript
if(hits.length>0){ 
  let best=hits[0],bs=-1; 
  for(const h of hits){ 
    const p=text.slice(Math.max(0,h-pre.length),h),s=text.slice(h+q.length,h+q.length+suf.length); 
    const sc=(p===pre?pre.length:0)+(s===suf?suf.length:0); 
    if(sc>bs){bs=sc;best=h;} 
  } 
  if(bs>0 || (!pre && !suf)) return {status:'anchored',start:best,end:best+q.length}; 
}
// Fall through to pre && suf and fuzzyFind...
```

**Strategy for Truncation Test**:
Rewrite the test in `tests/collab.spec.js` to target `#why` and mutate both the prefix and quote:
```javascript
const targetQuote = "Waiting another cycle compounds the overlap cost and the maintenance burden of three integrations.";
// ... add comment ...
await page.evaluate(() => {
  const why = document.querySelector('#why').nextElementSibling;
  why.innerHTML = why.innerHTML.replace(
    "gives a clean migration window. Waiting", 
    "provides a clear migration window. Delaying"
  );
});
// ... assert stale ...
```

## Verification Method
1. Run `npx playwright test tests/collab.spec.js`.
2. The teleportation test (`Disambiguation teleportation bug fixed for non-unique quotes`) will pass because the edited comment correctly falls through to `stale` instead of anchoring to the duplicate.
3. The rewritten truncation test (`Fuzzy matching correctly handles truncation bug`) will genuinely verify the chunking logic deep in the document.
