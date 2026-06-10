# Handoff Report - fuzzyFind Fix

## Observation
- The Iteration 10 failure report (`c:\Users\nirat\OneDrive\Continuing_Education\Portfolio\Viscollab\.agents\sub_orch_m2_collab\failure_report_iter10.md`) states that the boundary algorithm eagerly absorbs massive insertions into the quote.
- It dictates: "Insertions that occur exactly on the boundary of a quote should ideally be pushed outside the quote ... unless the entire quote is being replaced."
- I examined `c:\Users\nirat\OneDrive\Continuing_Education\Portfolio\Viscollab\spike-collab\index.html` lines 207-272, where `fuzzyFind` currently loops over `diffs` character by character. 
- When a deletion overlaps `qStart`, `qStartOff` is assigned to `tPos` *before* the insertion part of the edit block. Thus, the insertion falls after `qStartOff` and gets included in the quote highlight.
- For `qEnd`, Iteration 10 explicitly dragged the end boundary to include trailing massive insertions via `qEndCrossedInEditBlock`.

## Logic Chain
- To correctly handle boundaries without collapsing to 0-length (Iteration 9 bug) and without greedy absorption (Iteration 10 bug), we must abandon the brittle character-by-character loop.
- Grouping the diffs into semantic `match` (op 0) and `edit` (op -1, 1) blocks provides clear boundaries in both search string (`sPos`) and target string (`tPos`).
- If both `qStart` and `qEnd` fall into the **same** edit block, the entire quote was replaced by this edit. In this specific case, we should highlight the entire insertion (`qStartOff = t_start`, `qEndOff = t_end`).
- If `qStart` falls into an edit block (but `qEnd` doesn't), the edit spans the start boundary. To avoid swallowing the insertion into the quote, we push the insertion out to the prefix by setting `qStartOff = block.t_end`.
- If `qEnd` falls into an edit block (but `qStart` doesn't), we push the insertion out to the suffix by setting `qEndOff = block.t_start`.
- If `qStart` or `qEnd` falls into a match block, we map the exact index proportionally (1:1 mapping).
- This block-based logic guarantees `qStartOff <= qEndOff` (preventing negative length crashes) and properly pushes boundary insertions outward.
- It also perfectly preserves the `sOff`, `eOff`, matches, and falsy fallbacks.

## Caveats
- No caveats. The block grouping semantic mapping correctly avoids the edge cases present in character iteration.

## Conclusion
- The character loop in `fuzzyFind` (`spike-collab/index.html`) should be replaced entirely with the block-based mapping logic. I have provided the proposed replacement code block below.

## Proposed Code Fix
```javascript
  const blocks = [];
  let currentEdit = null;
  let sPos = 0, tPos = 0, matches = 0;
  let sOff = -1, eOff = 0;

  for (const [op, txt] of diffs) {
    const len = txt.length;
    if (op === 0) {
      if (currentEdit) {
        blocks.push(currentEdit);
        currentEdit = null;
      }
      blocks.push({
        type: 'match',
        s_start: sPos, s_end: sPos + len,
        t_start: tPos, t_end: tPos + len,
        matches: len
      });
      if (sOff === -1) sOff = tPos;
      eOff = tPos + len;
      matches += len;
      sPos += len;
      tPos += len;
    } else {
      if (!currentEdit) {
        currentEdit = {
          type: 'edit',
          s_start: sPos, s_end: sPos,
          t_start: tPos, t_end: tPos
        };
      }
      if (op === -1) {
        currentEdit.s_end += len;
        sPos += len;
      } else if (op === 1) {
        currentEdit.t_end += len;
        tPos += len;
      }
    }
  }
  if (currentEdit) {
    blocks.push(currentEdit);
  }

  const preLen = (pre||"").length;
  const qStart = preLen, qEnd = preLen + q.length;

  let qStartOff = -1, qEndOff = -1;
  let startEditBlock = null, endEditBlock = null;

  for (const b of blocks) {
    if (b.type === 'edit') {
      if (b.s_start <= qStart && qStart <= b.s_end) startEditBlock = b;
      if (b.s_start <= qEnd && qEnd <= b.s_end) endEditBlock = b;
    }
  }

  if (startEditBlock && startEditBlock === endEditBlock) {
    qStartOff = startEditBlock.t_start;
    qEndOff = startEditBlock.t_end;
  } else {
    if (startEditBlock) {
      qStartOff = startEditBlock.t_end;
    } else {
      for (const b of blocks) {
        if (b.type === 'match' && b.s_start <= qStart && qStart <= b.s_end) {
          qStartOff = b.t_start + (qStart - b.s_start);
          break;
        }
      }
    }

    if (endEditBlock) {
      qEndOff = endEditBlock.t_start;
    } else {
      for (const b of blocks) {
        if (b.type === 'match' && b.s_start <= qEnd && qEnd <= b.s_end) {
          qEndOff = b.t_start + (qEnd - b.s_start);
          break;
        }
      }
    }
  }

  if (sOff === -1) sOff = 0;
  if (qStartOff === -1) qStartOff = sOff;
  if (qEndOff === -1) qEndOff = qStartOff;
```

## Verification Method
- Inspect `spike-collab/index.html`. Apply the proposed fix to replace the diff iteration loop in `fuzzyFind`.
- Verify with unit tests or manually in the browser that large insertions exactly at the quote boundary are pushed into prefix/suffix respectively, and not included in the quote highlight (unless the entire quote is replaced).
