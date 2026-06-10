# Handoff Report: Fixing Disambiguation Teleportation Bug

## Observation
In `spike-collab/index.html` within the `locate()` function (around line 256):
```javascript
  if(hits.length===1) return {status:'anchored',start:hits[0],end:hits[0]+q.length};
  if(hits.length>1){ let best=hits[0],bs=0; for(const h of hits){ const p=text.slice(Math.max(0,h-pre.length),h),s=text.slice(h+q.length,h+q.length+suf.length); const sc=(p.endsWith(pre)?pre.length:0)+(s.startsWith(suf)?suf.length:0); if(sc>bs){bs=sc;best=h;} } if(bs>0) return {status:'anchored',start:best,end:best+q.length}; }
```
When `hits.length === 1`, the code immediately returns `anchored` without verifying if the prefix/suffix context matches. If the original occurrence of a phrase is edited, its exact match is removed. If another identical occurrence exists elsewhere, `hits.length` becomes `1`. The code blindly anchors to this remaining instance, causing the "teleportation" bug and bypassing context checks.

## Logic Chain
1. The bug occurs because the single-hit optimization skips the context validation that prevents incorrect bindings.
2. The logic for `hits.length > 1` properly evaluates context by calculating a score (`sc`) based on exact prefix/suffix matches. It only anchors if the best score (`bs`) > 0.
3. By consolidating `hits.length === 1` and `hits.length > 1` into a single `if(hits.length > 0)` block, a single remaining hit will be subjected to the same context scoring.
4. If a single hit's context does not match at all (`bs === 0`), it will not anchor. Instead, it falls through to the `if(pre&&suf)` block, which searches for the original location's prefix/suffix. This correctly detects an in-place edit, marking the original location as `stale` (or falling back to `fuzzyFind`). This completely resolves the teleportation behavior.

## Caveats
If the document is aggressively edited such that the target text (`q`) remains intact but both its `prefix` and `suffix` are entirely completely rewritten, a single exact quote instance will fail the context check (`bs === 0`). It will fall through to `fuzzyFind`, which will locate `q` but return `{status:'stale', ...}`. This is acceptable and arguably more correct, as a complete context change warrants user confirmation (re-anchoring).

## Conclusion
We should replace the distinct `hits.length === 1` and `hits.length > 1` logic blocks with a single `hits.length > 0` block that enforces context checking for all exact quote matches. 

### Implementation Instructions:
In `c:\Users\nirat\OneDrive\Continuing_Education\Portfolio\Viscollab\spike-collab\index.html`, replace lines 256-257:

```javascript
  if(hits.length===1) return {status:'anchored',start:hits[0],end:hits[0]+q.length};
  if(hits.length>1){ let best=hits[0],bs=0; for(const h of hits){ const p=text.slice(Math.max(0,h-pre.length),h),s=text.slice(h+q.length,h+q.length+suf.length); const sc=(p.endsWith(pre)?pre.length:0)+(s.startsWith(suf)?suf.length:0); if(sc>bs){bs=sc;best=h;} } if(bs>0) return {status:'anchored',start:best,end:best+q.length}; }
```

With the unified logic:

```javascript
  if(hits.length>0){ let best=hits[0],bs=0; for(const h of hits){ const p=text.slice(Math.max(0,h-pre.length),h),s=text.slice(h+q.length,h+q.length+suf.length); const sc=(p.endsWith(pre)?pre.length:0)+(s.startsWith(suf)?suf.length:0); if(sc>bs){bs=sc;best=h;} } if(bs>0 || (!pre && !suf)) return {status:'anchored',start:best,end:best+q.length}; }
```

## Verification Method
1. Implement the change in `spike-collab/index.html`.
2. Open `index.html` in a browser. 
3. Duplicate a sentence or phrase (e.g., have two occurrences of "Consolidate").
4. Add a comment to the FIRST occurrence.
5. Enter "Edit mode".
6. Modify the FIRST occurrence (e.g., change "Consolidate" to "Merge").
7. Exit "Edit mode". The comment should NOT teleport to the second occurrence. It should correctly remain at the original location and be marked "stale — content changed".
