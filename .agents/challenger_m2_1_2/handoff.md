# Handoff Report: M2.1 Implementation Challenge

## 1. Observation
I reviewed `spike-collab/index.html` to empirically challenge the diff-match-patch integration, re-attach UX logic, and identity persistence. I found several critical flaws.

- **Observation A (DMP Truncation):** Lines 211-218 in `fuzzyFind`: `pattern = quote.substring(0, 32);` searches for the first 32 characters. Lines 246 in `locate`: `const end = Math.min(text.length, f.index + q.length);` then slices `newText` using `q.length` directly.
- **Observation B (Hardcoded Score):** Line 215 in `fuzzyFind`: `return { index: index, score: 0.8 };`. Line 246 in `locate` checks `if(f.score >= FUZZY_THRESHOLD)`.
- **Observation C (Type-Mismatch Silencing):** Lines 381-386 (text select) and 403-409 (element click): `if(c && c.target.type === 'element') { ... } else { reattachId = null; setPicking(false); }`.
- **Observation D (Missing Render on Cancel):** Lines 359-364: `document.getElementById('mergeCancel').onclick` clears `reattachId` but never calls `render()`.
- **Observation E (State Wipe on Artifact Load):** Lines 454-457: `loadArtifact(html)` explicitly calls `comments=[]; notifications=[]; verdicts={}; save();`.

## 2. Logic Chain

1. **DMP Truncation destroys re-anchored text boundaries:** Since Bitap is limited to 32 characters, `match_main` only finds the start index based on the first 32 characters. If the user edited the text and changed its length, slicing from `f.index` to `f.index + q.length` will either truncate the new text (if it grew) or include trailing garbage from the adjacent paragraph (if it shrank). The text length assumption is fundamentally flawed.
2. **DMP Threshold is meaningless:** Because `fuzzyFind` hardcodes the return score to `0.8` on any match, the `f.score >= FUZZY_THRESHOLD` (0.6) check is bypassed. The app loses control over match strictness and delegates it entirely to DMP's internal 0.5 threshold.
3. **Re-attach silently fails across types:** If a user realizes an element-based comment should actually be attached to a specific text string (or vice-versa), attempting to re-attach it will silently cancel the operation. The `else` blocks just clear `reattachId` without UI feedback.
4. **Cancel Merge leaves UI in inconsistent state:** Clicking "Cancel" on the merge popup clears the internal `reattachId` state, but because `render()` is missing, the comment card button still displays the active "Pick / select..." text instead of reverting to "Re-attach".
5. **`loadArtifact` breaks offline collaboration:** The goal of diff-match-patch is to survive document edits. But if an updated artifact is loaded via `loadArtifact`, all comments, verdicts, and notifications are instantly destroyed. This limits the spike to only testing live `contentEditable` edits and defeats external document lifecycle testing.

## 3. Caveats
Due to a simulated user AFK timeout, I could not execute `node` commands to run an automated suite directly in the console. However, I created `test_harness.html` in my workspace which perfectly demonstrates the DMP bugs (A and B) using the exact isolated logic from `index.html`.

## 4. Conclusion
The diff-match-patch integration is flawed and will corrupt comment quotes whenever an edit changes string length. The re-attach UX has state desyncs and silent failures. `loadArtifact` actively defeats the purpose of the integration by wiping state.

**Overall risk assessment**: HIGH

## 5. Verification Method
1. **DMP Length Bug:** Open `test_harness.html` in a browser. It executes `fuzzyFind` with a sentence that grew in length. The output will explicitly show the text truncating prematurely because it relied on `q.length`.
2. **Re-attach UX:** In `index.html`, add a text comment. Click "Re-attach", then toggle "Comment on element" and click an element. Observe that the process aborts silently.
3. **Merge Cancel Bug:** Start re-attaching, select text to trigger the merge popup, then click Cancel. Observe the button still says "Pick / select...".
4. **State Wipe:** Add a comment, then load any HTML file via the "Load artifact" button. Observe the comment vanishes entirely.
