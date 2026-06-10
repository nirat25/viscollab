# Handoff Report: Trailing Insertion Bug Analysis

## Observation
1. The `fuzzyFind` mapping logic currently sets `qEndOff = tPos` blindly whenever `sPos === qEnd`. (Observed in `spike-collab/index.html` line 243).
2. The failure report (`failure_report_iter7.md`) indicates that this causes trailing insertions (`op === 1`) to be erroneously absorbed into the quote highlight, while instructing that replacement text must still be captured.
3. `diff-match-patch` outputs boundary replacements as a deletion (`op === -1`) followed immediately by an insertion (`op === 1`). Trailing insertions are output as a match (`op === 0`) followed by an insertion (`op === 1`).
4. At the quote start, `qStartOff` freezes *before* an insertion. Because the highlight is `[qStartOff, qEndOff]`, freezing before the insertion correctly includes the text inside the boundary. To achieve the same inclusion at the end of the quote, `qEndOff` must do the opposite: it must advance *past* the insertion.

## Logic Chain
1. We cannot simply add `&& op !== 1` to the `qEndOff` condition (as is done for `qStartOff`). If we freeze `qEndOff` before a replacement insertion, both `qStartOff` and `qEndOff` would sit before the replacement text, resulting in a zero-length highlight that excludes the replacement entirely.
2. To capture replacements but ignore trailing insertions, `qEndOff` must advance through an `op === 1` block **if and only if** it replaces quote text.
3. Because `diff-match-patch` orders deletions before insertions, a replacement at the end of the quote guarantees that `sPos` reaches `qEnd` during an `op === -1` block. A strictly trailing insertion means `sPos` reaches `qEnd` during an `op === 0` block.
4. By recording the operation type when `sPos` first hits `qEnd` into a state variable (`qEndOp`), we can cleanly distinguish the two scenarios. If `sPos === qEnd` during an insertion (`op === 1`), we only advance `qEndOff` if `qEndOp === -1`.

**Proposed Algorithm:**
```javascript
  let qStartOff = -1, qEndOff = -1;
  let qEndOp = null; // New state variable to track boundary exit

  // Inside the inner loop of diff processing:
      if (sPos === qEnd) {
        if (op === 0 || op === -1) {
          qEndOff = tPos;
          qEndOp = op; // Track how we hit the boundary
        } else if (op === 1 && qEndOp === -1) {
          qEndOff = tPos; // Advance into replacement text
        }
      }
```

## Caveats
- If a replacement straddles the end boundary (deleting both the end of the quote and the beginning of the suffix), the algorithm will capture the insertion up to the exact character boundary where `sPos` exceeds `qEnd`. This is a safe degradation that avoids swallowing the entire suffix replacement.
- No changes are needed for `qStartOff` because freezing *before* a start-boundary insertion correctly places the inserted text inside the resulting `[qStartOff, qEndOff]` range.

## Conclusion
The Trailing Insertion Bug can be fixed by introducing a `qEndOp` state variable that tracks how the `qEnd` boundary was reached. `qEndOff` should always update on `0` or `-1`, but should only update on `1` if `qEndOp === -1`. This ensures replacements are fully highlighted while trailing insertions are safely ignored.

## Verification Method
1. Implement the `qEndOp` logic in `spike-collab/index.html` within the `fuzzyFind` function.
2. Open `index.html` in a browser.
3. **Trailing Insertion Test**: Create a comment on a word (e.g., "now"). Turn on Edit mode and insert "adays" immediately after "now" without a space ("nowadays"). Turn off Edit mode. The comment highlight should only cover "now", not "adays".
4. **Replacement Test**: Create a comment on a word (e.g., "now"). Turn on Edit mode, delete "now", and type "later". Turn off Edit mode. The comment highlight should cover "later".
5. Ensure the Disambiguation Teleportation Bug and Falsy Fallback (`0 ?? q.length`) fixes remain intact.
