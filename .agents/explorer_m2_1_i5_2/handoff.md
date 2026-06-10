# Handoff: M2.1 Implementation Bug Fix (Disambiguation Teleportation)

## 1. Observation
- The bug report states: `if(hits.length===1) return {status:'anchored',start:hits[0],end:hits[0]+q.length};` incorrectly teleports comments. If the original text is edited, but an identical string exists elsewhere in the document, `hits.length === 1` will be true, bypassing any context validation (prefix/suffix checks) and anchoring the comment to the wrong location.
- In `index.html` around line 255-257:
  ```javascript
  const hits=[]; let i=text.indexOf(q); while(i!==-1){ hits.push(i); i=text.indexOf(q,i+1); }
  if(hits.length===1) return {status:'anchored',start:hits[0],end:hits[0]+q.length};
  if(hits.length>1){ let best=hits[0],bs=0; for(const h of hits){ const p=text.slice(Math.max(0,h-pre.length),h),s=text.slice(h+q.length,h+q.length+suf.length); const sc=(p.endsWith(pre)?pre.length:0)+(s.startsWith(suf)?suf.length:0); if(sc>bs){bs=sc;best=h;} } if(bs>0) return {status:'anchored',start:best,end:best+q.length}; }
  ```

## 2. Logic Chain
- The current implementation has a fast-path for `hits.length === 1` that blindly trusts the match.
- If the commented text `q` is edited, the original instance no longer matches exactly. However, if the text `q` is a common word or phrase, and another instance of `q` exists elsewhere, `text.indexOf(q)` will find exactly 1 match (the other instance).
- Because `hits.length === 1`, it returns `{status:'anchored'}` for that unrelated instance. This is "teleportation".
- To fix this, we should evaluate the context (prefix/suffix) even when there is only 1 exact match. 
- We can simply merge the `hits.length === 1` and `hits.length > 1` blocks into a single `if(hits.length > 0)` block.
- This will cause the single remaining hit to be evaluated for its `prefix` and `suffix`. If neither matches, `bs` will be 0, and it will fall through.
- By falling through, it will correctly hit the `fuzzyFind` logic (or the `pre&&suf` exact bounding box logic), which will attempt to locate the edited original text near the original prefix/suffix, returning `stale` (correctly indicating the content was modified), or `orphaned` if it can't find it.

## 3. Caveats
- If the document is extremely short (no prefix and no suffix) AND exactly 1 hit exists, `sc` will be 0 (since `pre.length` and `suf.length` are 0). However, since `bs` initializes to 0, `bs > 0` would fail, making it fall through to fuzzy. Fuzzy will find the exact match and return `stale`, which is a minor UX degradation (says "stale" instead of "anchored"). This is an extreme edge case (the whole document is just the quote) and is acceptable.
- If the user edits BOTH the prefix and suffix slightly, `sc` becomes 0, and it falls through to fuzzy, which is exactly what we want (it becomes `stale` because context changed).

## 4. Conclusion
We must remove the `hits.length === 1` early return and apply the context scoring to all exact matches (`hits.length > 0`).

**Action for Worker**:
In `c:\Users\nirat\OneDrive\Continuing_Education\Portfolio\Viscollab\spike-collab\index.html` inside the `locate` function:

Find these lines (~255-257):
```javascript
  const hits=[]; let i=text.indexOf(q); while(i!==-1){ hits.push(i); i=text.indexOf(q,i+1); }
  if(hits.length===1) return {status:'anchored',start:hits[0],end:hits[0]+q.length};
  if(hits.length>1){ let best=hits[0],bs=0; for(const h of hits){ const p=text.slice(Math.max(0,h-pre.length),h),s=text.slice(h+q.length,h+q.length+suf.length); const sc=(p.endsWith(pre)?pre.length:0)+(s.startsWith(suf)?suf.length:0); if(sc>bs){bs=sc;best=h;} } if(bs>0) return {status:'anchored',start:best,end:best+q.length}; }
```

Replace them with:
```javascript
  const hits=[]; let i=text.indexOf(q); while(i!==-1){ hits.push(i); i=text.indexOf(q,i+1); }
  if(hits.length>0){ let best=hits[0],bs=0; for(const h of hits){ const p=text.slice(Math.max(0,h-pre.length),h),s=text.slice(h+q.length,h+q.length+suf.length); const sc=(p.endsWith(pre)?pre.length:0)+(s.startsWith(suf)?suf.length:0); if(sc>bs){bs=sc;best=h;} } if(bs>0) return {status:'anchored',start:best,end:best+q.length}; }
```

## 5. Verification Method
1. Make the change to `index.html`.
2. Open `index.html` in a browser.
3. Add a text comment on a word that appears exactly twice in the document.
4. Go into "Edit mode" and edit the *commented* occurrence of the word.
5. Exit "Edit mode".
6. The comment should **not** teleport to the second occurrence. It should become "stale" on the edited text (or orphaned if completely rewritten).
