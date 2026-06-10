# Handoff Report - fuzzyFind Fix

## 1. Observation
- The failure report (`failure_report_iter10.md`) indicates that when a deletion overlaps `qStart` or `qEnd`, `qStartOff` / `qEndOff` greedily absorb adjacent massive insertions into the quote match.
- In `index.html`, lines 226-266 run a character-by-character loop. If an `op === -1` hits `sPos === qStart`, `qStartOff` binds to `tPos`. Later `op === 1` insertions increment `tPos` inside the quote. For `qEnd`, Iteration 10 introduced `qEndCrossedInEditBlock` which explicitly sets `qEndOff = tPos` after insertions. Both mechanisms trap unrelated insertions inside the highlight.

## 2. Logic Chain
- To distinguish a "boundary overlap" from an "entire quote replacement", we must group `diffs` into contiguous semantic operations: `match` blocks (op `0`) and `edit` blocks (merged ops `-1` and `1`).
- By tracking `s_start`/`s_end` (source offsets) and `t_start`/`t_end` (target offsets) for each block, we gain a macro-view of replacements.
- **Boundary rule**: If `qStart` falls inside an `edit` block, we check if the quote continues past the block (`qEnd > b.s_end`). If it does, this is a starting boundary overlap. The insertion belongs to the prefix, so the quote highlight should start *after* the insertion (`qStartOff = b.t_end`).
- **Boundary rule**: If `qEnd` falls inside an `edit` block, we check if the quote started before the block (`qStart < b.s_start`). If it did, this is an ending boundary overlap. The insertion belongs to the suffix, so the quote highlight should end *before* the insertion (`qEndOff = b.t_start`).
- **Total replacement rule**: If both `qStart` and `qEnd` fall fully within the *same* `edit` block, the user's reference text was completely overwritten. We set `qStartOff = b.t_start` and `qEndOff = b.t_end` so the new inserted text replaces the quote, preventing a 0-length collapse.
- This edit-block logic entirely eliminates the fragility of `-1` vs `1` diff ordering and cleanly separates overlapping boundaries from total replacements.

## 3. Caveats
- Diff ops MUST be correctly contiguous for a single logical change. `diff_match_patch`'s `diff_cleanupSemantic` ensures this, so the block clustering is robust.
- No caveats.

## 4. Conclusion
- Replace the fragile character-by-character loops with an edit-block clustering algorithm.

## 5. Verification Method
- In `index.html`, run `diff_match_patch` with a string where a boundary deletion is replaced by a large insertion (e.g. quote "C D", text modified from "B C D E" to "X Y Z D").
- Verify that the massive insertion "X Y Z" correctly falls outside the bounds of `qStartOff` and `qEndOff`.
- Apply the patch below and run the collaboration spike in the browser to confirm the logic bug is fixed.

---

### Proposed Fix for `index.html`

Replace lines 226-266 in `c:\Users\nirat\OneDrive\Continuing_Education\Portfolio\Viscollab\spike-collab\index.html` with the following block logic:

```javascript
  let matches = 0, sOff = -1, eOff = 0;
  const preLen = (pre||"").length;
  const qStart = preLen, qEnd = preLen + q.length;

  const blocks = [];
  let s = 0, t = 0;
  for (const [op, txt] of diffs) {
    const len = txt.length;
    if (op === 0) {
      if (sOff === -1) sOff = t;
      matches += len;
      blocks.push({ type: 'match', s_start: s, s_end: s + len, t_start: t, t_end: t + len });
      s += len;
      t += len;
      eOff = t;
    } else if (op === -1) {
      if (blocks.length > 0 && blocks[blocks.length - 1].type === 'edit') {
        blocks[blocks.length - 1].s_end += len;
      } else {
        blocks.push({ type: 'edit', s_start: s, s_end: s + len, t_start: t, t_end: t });
      }
      s += len;
    } else if (op === 1) {
      if (blocks.length > 0 && blocks[blocks.length - 1].type === 'edit') {
        blocks[blocks.length - 1].t_end += len;
      } else {
        blocks.push({ type: 'edit', s_start: s, s_end: s, t_start: t, t_end: t + len });
      }
      t += len;
    }
  }

  let qStartOff = -1, qEndOff = -1;

  for (const b of blocks) {
    if (qStartOff === -1) {
      if (b.type === 'match' && qStart >= b.s_start && qStart < b.s_end) {
        qStartOff = b.t_start + (qStart - b.s_start);
      } else if (b.type === 'edit' && qStart >= b.s_start && qStart <= b.s_end) {
        if (qEnd <= b.s_end) qStartOff = b.t_start;
        else qStartOff = b.t_end;
      }
    }
    if (qEndOff === -1) {
      if (b.type === 'match' && qEnd >= b.s_start && qEnd <= b.s_end) {
        qEndOff = b.t_start + (qEnd - b.s_start);
      } else if (b.type === 'edit' && qEnd >= b.s_start && qEnd <= b.s_end) {
        if (qStart >= b.s_start) qEndOff = b.t_end;
        else qEndOff = b.t_start;
      }
    }
  }

  if (sOff === -1) sOff = 0;
  if (qStartOff === -1) qStartOff = sOff;
  if (qEndOff === -1) qEndOff = qStartOff;
```
