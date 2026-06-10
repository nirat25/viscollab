# Handoff Report - M2.1 Iteration 6 (Explorer Analysis)

## 1. Observation
- `failure_report_iter5.md` indicates the Playwright test was a dummy because it only mutated the target quote. By leaving the prefix intact, the exact-prefix fallback block `if(pre&&suf)` safely recovered the comment, bypassing `fuzzyFind` entirely.
- In `spike-collab/tests/collab.spec.js` (note: the user requested `collaboration.spec.ts` but the file is `collab.spec.js`), the test `Disambiguation teleportation bug fixed for non-unique quotes` executes `.replace("Duplicated quote test.", "Duplicated edited quote test.")`, leaving the prefix unmodified.
- In `spike-collab/index.html`, `fuzzyFind` utilizes `diff-match-patch` with `Match_Distance = 1000000`. It solely matches the `quote` without verifying the surrounding context. If a user mutates the original quote and prefix, `fuzzyFind` will effortlessly lock onto a 100% exact duplicate of the quote elsewhere in the document, resulting in a false-positive teleportation.

## 2. Logic Chain
- To fix the teleportation bug natively, the fallback logic must be updated to "refuse to teleport" when context doesn't match. 
- Modifying `fuzzyFind` to calculate the whole `pre+quote+suf` boundary natively is cumbersome. The simpler, highly effective approach is **post-validation**: if `fuzzyFind` returns a match (`f.score >= FUZZY_THRESHOLD`), we extract the surrounding context (`fPre`, `fSuf`) at the newly found `f.index`.
- We then compute the similarity between the found context (`fPre`, `fSuf`) and the original context (`pre`, `suf`) using `dmp.diff_main()`. 
- If the context score (matching characters / total context length) is below a specific threshold (e.g., `< 0.3`), the match resides in an alien context. The logic correctly infers this is a teleportation attempt and safely returns `{ status: 'orphaned' }` instead of blindly accepting it.
- To write a genuine test, the Playwright script must mutate **both the prefix and the quote** to destroy exact boundary matching and force the `fuzzyFind` tier to execute.

## 3. Caveats
- The test file is actually named `tests/collab.spec.js`, not `collaboration.spec.ts`.
- By rejecting the teleportation, the comment will become `orphaned`. This is the intended "safe" behavior when context is irreparably lost or shadowed by a perfect match elsewhere. It requires the user to manually re-attach the comment instead of silently assigning it to the wrong paragraph.

## 4. Conclusion
**Fix Strategy for `index.html`:**
Update `locate()` to calculate a `ctxScore` for the match returned by `fuzzyFind`. If the context is entirely different, orphan it:
```javascript
  const hint=pre?text.indexOf(pre):-1; const f=fuzzyFind(text,q,hint>=0?hint+pre.length:-1);
  if(f.score>=FUZZY_THRESHOLD){ 
    // Fix: Context validation to prevent disambiguation teleportation
    const fPre = text.slice(Math.max(0, f.index - pre.length), f.index);
    const fSuf = text.slice(f.index + f.length, f.index + f.length + suf.length);
    
    let ctxMatches = 0;
    let ctxTotal = 0;
    if (pre) {
      ctxTotal += pre.length;
      const pDiffs = dmp.diff_main(pre, fPre);
      for (const [op, txt] of pDiffs) if (op === 0) ctxMatches += txt.length;
    }
    if (suf) {
      ctxTotal += suf.length;
      const sDiffs = dmp.diff_main(suf, fSuf);
      for (const [op, txt] of sDiffs) if (op === 0) ctxMatches += txt.length;
    }
    
    const ctxScore = ctxTotal > 0 ? ctxMatches / ctxTotal : 1;
    if (ctxTotal > 0 && ctxScore < 0.3) {
      return {status:'orphaned'}; // Refuse to teleport to alien context
    }

    const end=Math.min(text.length,f.index+(f.length||q.length)); 
    return {status:'stale',start:f.index,end,newText:text.slice(f.index,end),fuzzy:+f.score.toFixed(2)}; 
  }
```

**Test Strategy for `tests/collab.spec.js`:**
Rewrite the string replacement in the Playwright test to mutate both the prefix and the quote, verifying it results in an orphaned state rather than a stale teleportation:
```javascript
    await page.click('#editToggle');
    await page.evaluate(() => {
      // The original prefix ends with "use case." and the quote is " Duplicated quote test."
      // We mutate BOTH to break exact matching and force fuzzyFind to evaluate.
      document.querySelector('#lead').innerHTML = document.querySelector('#lead').innerHTML
        .replace("use case. Duplicated quote test.", "use scenario. Duplicated edited quote test.");
    });
    await page.click('#editToggle');

    // Because both changed, fuzzyFind will evaluate the identical quote at #why.
    // The new context validation will reject it due to mismatched prefix/suffix.
    // The comment should be orphaned, proving teleportation was prevented.
    await expect(commentLoc.locator('.b-orphaned')).toBeVisible();
    const isOrphaned = await page.evaluate(() => window.__spike.comments[0].anchorStatus === 'orphaned');
    expect(isOrphaned).toBeTruthy();
```

## 5. Verification Method
After the implementer agent applies the changes, run:
`npx playwright test tests/collab.spec.js`
The test must successfully pass, demonstrating that the teleportation bug is fixed and the comment degrades gracefully to an orphaned state.
