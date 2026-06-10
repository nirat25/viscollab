# Handoff Report: M2.1 Iteration 5 - Fix Strategy

## 1. Observation
- **Disambiguation Teleportation Bug**: In `spike-collab/index.html` line 256, `locate()` blindly returns `anchored` when `hits.length === 1` (`if(hits.length===1) return {status:'anchored',start:hits[0],end:hits[0]+q.length};`). This ignores the context strings. If a duplicate quote exists and the originally targeted instance is edited in-place, the quote becomes unique (`hits.length === 1`). The function blindly anchors to the remaining instance, teleporting the comment instead of properly detecting the edit.
- **Dummy Test Integrity Violation**: In `spike-collab/tests/collab.spec.js` lines 93-112, the test `Fuzzy matching correctly handles truncation bug` uses a quote located at the very start of the document (`Recommendation: consolidate...`) and modifies the quote itself (`replace("Recommendation: ", "Rec: ")`). The original bug involved a deep document target and a prefix modification triggering a `hint = -1` bug in `fuzzyFind`. The dummy test does neither.

## 2. Logic Chain
- **Fixing Teleportation**: We can combine the `hits.length === 1` and `hits.length > 1` logic into a single `hits.length > 0` block. By calculating the context score (`sc`) for all hits, we can require `bs > 0` (or no prefix/suffix existing) to return `anchored`. If a duplicate is edited, the remaining wrong instance will have a score of `0` (context mismatch). The check will fail and fall through to the `pre&&suf` or `fuzzyFind` logic, which will successfully find the modified original instance and mark it `stale`.
- **Fixing the Dummy Test**: To genuinely test the 32-character chunk truncation bug under a negative hint, the test must:
  1. Pick a quote deep in the document (e.g., from the `#risks` section).
  2. Modify its **prefix** (the 32 characters immediately preceding it) to ensure `text.indexOf(pre)` returns `-1`.
  3. Modify the **quote** itself so exact matching fails (`hits.length === 0`), forcing the algorithm into `fuzzyFind` with `hintIdx = -1`.

## 3. Caveats
- With the new unified logic, if a user heavily rewrites *both* the 32-character prefix and suffix around a quote but leaves the quote completely untouched, the comment will be marked `stale` instead of `anchored`. This is actually desirable behavior; if the context completely changes, `stale` safely alerts the user to review it.

## 4. Conclusion
**Code Fix Strategy (`spike-collab/index.html`):**
Replace lines 256-257 with a unified context-checking block:
```javascript
  if(hits.length>0){ 
    let best=hits[0],bs=0; 
    for(const h of hits){ 
      const p=text.slice(Math.max(0,h-pre.length),h),s=text.slice(h+q.length,h+q.length+suf.length); 
      const sc=(p.endsWith(pre)?pre.length:0)+(s.startsWith(suf)?suf.length:0); 
      if(sc>bs){bs=sc;best=h;} 
    } 
    if(bs>0 || (!pre && !suf)) return {status:'anchored',start:best,end:best+q.length}; 
  }
```

**Test Fix Strategy (`spike-collab/tests/collab.spec.js`):**
Replace the dummy test with a genuine deep-target prefix-modification test:
```javascript
  test('Fuzzy matching correctly handles truncation bug (deep target, prefix-modification)', async ({ page }) => {
    const targetQuote = "run both pipelines in parallel for one week and reconcile before cutting the old vendors.";
    
    // Add comment to a deep target
    await page.evaluate((q) => {
      window.__spike.addText(q, "Deep truncation test comment");
    }, targetQuote);

    const commentLoc = page.locator('.cmt').filter({ hasText: 'Deep truncation test comment' });
    await expect(commentLoc).toBeVisible();

    // Modify BOTH the prefix and the quote itself
    await page.click('#editToggle');
    await page.evaluate(() => {
      const p = Array.from(document.querySelectorAll('p')).find(p => p.textContent.includes('Primary risk'));
      p.innerHTML = p.innerHTML
        .replace("Mitigation: ", "Fix: ") // Breaks the prefix
        .replace("run both pipelines", "run two pipelines"); // Breaks exact quote match
    });
    await page.click('#editToggle');

    // It should fall through to fuzzy match and be marked stale
    await expect(commentLoc.locator('.b-stale')).toBeVisible();
    const isStale = await page.evaluate(() => window.__spike.comments[0].anchorStatus === 'stale');
    expect(isStale).toBeTruthy();
  });
```

## 5. Verification Method
1. Implement the provided strategies in `index.html` and `tests/collab.spec.js`.
2. Run the tests in the `spike-collab` directory: `npx playwright test tests/collab.spec.js`
3. Both the `Disambiguation teleportation bug fixed` test and the new `deep target, prefix-modification` test should pass, demonstrating the bugs are genuinely fixed.
