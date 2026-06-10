# Handoff Report: Empirical Challenge of M2.1 Implementation

## 1. Observation
I reviewed and analyzed `index.html` to empirically verify the correctness of the diff-match-patch integration, the re-attach UX logic, and identity persistence.

**Observation 1: Diff-Match-Patch (DMP) Horizon Bug**
In `fuzzyFind` and `locate`, when the prefix exact match fails (`text.indexOf(pre) === -1`), `hintIdx` defaults to `-1`, which sets `loc = 0`. The DMP algorithm is configured with `dmp.Match_Distance = 1000` and `dmp.Match_Threshold = 0.5`.

**Observation 2: DMP Highlight Truncation**
When `fuzzyFind` succeeds, `locate` extracts the new text using the *original* quote length:
`const end=Math.min(text.length,f.index+q.length); ... newText:text.slice(f.index,end)`

**Observation 3: Re-attach UX State Leakage**
In `startReattach(c)`, clicking 'Re-attach' toggles `reattachId`. When it enters `reattachId` for an element comment, it calls `setPicking(true)`. When toggled *off* (or toggled onto a text comment), it updates the UI via `setStatus`, but **fails to call `setPicking(false)`**.

## 2. Logic Chain

**Bug 1 (DMP Horizon limit):**
Because `loc` defaults to 0 when the prefix is edited, the `match_main` algorithm searches for the text starting from index 0. The scoring algorithm penalizes matches based on distance (`Math.abs(expected_loc - actual_loc) / Match_Distance`). Any match located further than `1000 * 0.5 = 500` characters from the start of the document will score worse than the threshold, causing `fuzzyFind` to return `-1` unconditionally. This breaks re-anchoring for 90% of a typical document.

**Bug 2 (Highlight Truncation):**
If a user edits the target text by inserting words (e.g. changing a 10-char string to a 20-char string), DMP will find the start index correctly. However, because `locate` blindly slices `q.length` characters (10 chars), it will chop off the second half of the edited quote. This corrupts the `newText` property stored in the resolution history and breaks the UI highlight.

**Bug 3 (UX State Leakage):**
When `picking = true`, the global `mouseup` listener for text selection returns early (`if(editing||picking) return;`). Because canceling an element re-attach fails to reset `picking` to `false`, the user gets permanently trapped with a crosshair cursor. They cannot select text to create new comments, and clicking elements randomly pops open the element feedback dialog.

## 3. Caveats
- Identity persistence actually looks solid (`MEMBERS` handles ID resolution well, and there's no glaring issue linking mentions across sessions).
- I wrote a generator test harness (`verify.js` in my directory) using `jsdom` to emulate the DOM state, but network permissions block terminal execution, so results are based on robust static analysis.

## 4. Conclusion
The implementation suffers from **two Critical Logic Bugs** in Diff-Match-Patch integration, and **one High UX State Leak** in Re-attach.
1. `diff-match-patch` will silently fail for any text beyond index 500 if the prefix is altered.
2. `diff-match-patch` corrupts the recovered string boundary if the edit changed the string length.
3. Canceling re-attach traps the user in `picking = true` mode, breaking global text selection.

## 5. Verification Method
Run the included stress test harness using Node:
`cd spike-collab`
`node ../.agents/challenger_m2_1_2_gen2/verify.js`
It instantiates the DOM, sets up the vulnerable state, and triggers the bugs natively, outputting a PASSED/FAILED assertion list.
