# Handoff Report: Overlapping Replacements Bug in `fuzzyFind`

## 1. Observation
- `SCOPE.md` directs investigation to `spike-collab`.
- The failure report (`failure_report_iter9.md`) describes an "Overlapping Replacements Bug" in `fuzzyFind`: When a replacement diff chunk (`op === -1` followed by `op === 1`) swallows both the quote and the suffix, the `sPos` increments past `qEnd` during the `op === -1` block.
- In `spike-collab/index.html` (lines 207-262), the trailing insertion block (`op === 1`) relies on the exact condition `sPos === qEnd` to append the insertion to `qEndOff`.
- Because `sPos` is strictly greater than `qEnd` by the time the `op === 1` chunk is evaluated, the condition `sPos === qEnd` evaluates to `false`. This drops the inserted text from the quote bounds, resulting in a 0-length highlight (since `qEndOff` remains at `qStartOff`).

## 2. Logic Chain
1. A replacement is represented by diff-match-patch as contiguous `[-1, text]` and `[1, text]` operations with no `[0, text]` in between.
2. If `qEnd` falls within the `[-1, ...]` chunk, `sPos === qEnd` is triggered exactly once during that deletion iteration. This is the optimal time to set a flag, `qEndPendingInsert = true`, to indicate that `qEnd` was destroyed in the current edit block.
3. If an `[1, ...]` chunk immediately follows, we are still in the same contiguous replacement block. We can identify this by ensuring `qEndPendingInsert` is only reset to `false` when a `[0, ...]` match block is encountered at the chunk level.
4. During an `op === 1` block, if `qEndPendingInsert` is `true` AND `sPos >= qEnd`, it implies the current insertion is replacing text that included `qEnd`. Therefore, `qEndOff` must advance with `tPos` to absorb the replacement text.
5. This logic natively supports trailing insertions (where `sPos === qEnd` precisely) and crossing insertions (where `sPos > qEnd`) while preserving Falsy Fallback and Disambiguation Teleportation (as it strictly modifies inner loop chunk tracking). BOF/EOF fixes (`qStartOff === -1` defaulting to `sOff`, and `qEndOff === -1` defaulting to `qStartOff`) remain entirely untouched.

## 3. Caveats
- If a replacement crosses `qStart` but the replaced text mostly belonged to the prefix, `qStartOff` locks in at the start of the insertion. This means the quote highlight includes the whole replacement, even if only the end of the replacement conceptually maps to the quote. However, this is heavily preferable to a 0-length match (which visually breaks the UI entirely), and standardizing `qEndOff` to absorb the insertion correctly resolves the critical bug identified in the iteration 9 failure report.
- The logic assumes `diff-match-patch` consistently groups replacements as `-1` then `1` blocks without interleaved `0` blocks, which is its guaranteed semantic behavior.

## 4. Conclusion
The Overlapping Replacements bug can be robustly fixed by introducing a block-level tracking flag (`qEndPendingInsert`). The `fuzzyFind` loops should be updated as follows:

```javascript
    let sPos = 0, tPos = 0, matches = 0, sOff = -1, eOff = 0;
    let qStartOff = -1, qEndOff = -1;
    let qEndPendingInsert = false;
    const preLen = (pre||"").length;
    const qStart = preLen, qEnd = preLen + q.length;

    for (const [op, txt] of diffs) {
      if (op === 0) qEndPendingInsert = false;

      for (let i = 0; i < txt.length; i++) {
        if (sPos === qStart && qStartOff === -1 && op !== 1) qStartOff = tPos;
        
        if (op === 0) {
          if (sOff === -1) sOff = tPos;
          matches++; sPos++; tPos++; eOff = tPos;
        } else if (op === -1) {
          sPos++;
        } else if (op === 1) {
          tPos++;
        }

        if (sPos === qEnd && op !== 1) {
          qEndOff = tPos;
          if (op === -1) qEndPendingInsert = true;
        } else if (op === 1 && qEndPendingInsert && sPos >= qEnd) {
          qEndOff = tPos;
        }
      }
    }
```
*Note: This replaces the previous `qEndOp` logic.*

## 5. Verification Method
1. Open `spike-collab/index.html`.
2. Locate `fuzzyFind`.
3. Introduce `let qEndPendingInsert = false;`.
4. Apply the state updates inside the loop exactly as proposed above.
5. Create a test case replacing "Hello" with "Hi" where the quote is "He". Ensure the match length evaluates to the length of "Hi" (2) instead of 0.
6. Run `node test_fuzzy_script.js` or standard Playwright tests to ensure `EOF`, `BOF`, and trailing insertion behaviors are identical to iteration 9.
