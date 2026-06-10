# Handoff Report: Milestone 2.1 Iteration 3

## Observation
I investigated the 4 bugs reported by the Forensic Auditor in the `spike-collab` codebase. 
1. **Fuzzy Match Truncation**: In `spike-collab/index.html` (line 212), `fuzzyFind` truncates patterns to 32 characters (`const pattern = quote.substring(0, 32);`). The `Match_Distance` is restricted to 1000 (line 208).
2. **Disambiguation / Anchor Teleportation**: In `locate(root,c)` (line 252), when `hits.length > 1`, `bs` initializes to `-1`. If no surrounding context matches for any hit, `bs` becomes `0` on the first iteration, and `best` blindly defaults to `hits[0]`, causing silent teleportation.
3. **Merge UX Race Condition**: In `startReattach(c)` (line 357), there is no defensive reset of the active modal. The confirmation callback for `mergepop` (line 394/420) unconditionally sets `reattachId = null`, aborting any secondary workflow.
4. **Persistence Limitation**: `toggleEdit(force)` (line 462) toggles `art.contentEditable` but does not save `art.innerHTML` to `localStorage` when exiting edit mode.

## Logic Chain
1. **Fuzzy Matching**: `diff_match_patch.match_main` uses the Bitap algorithm, strictly requiring patterns $\le$ 32 chars. Truncating large quotes causes failures if edits exist in the first 32 chars. A robust strategy is to loop through the `quote` in 32-character chunks, trying `match_main` on each chunk until one returns `index !== -1`, then deriving the original start index. Additionally, `dmp.Match_Distance` should be expanded to `text.length` (or a very large constant) to permit arbitrarily moved text.
2. **Disambiguation Teleportation**: By changing the baseline score `bs = 0` (instead of `-1`), we can detect when *no* hit has valid context. If `bs` remains 0 after evaluating all hits, we should return `{status: 'orphaned'}` rather than silently anchoring to `hits[0]`.
3. **Race Condition**: `startReattach` must forcefully close any open `mergepop` modal and nullify `mergeAction` to prevent conflicting parallel states. The `showMergePop` callback must defensively verify `if (reattachId === c.id)` before resetting state.
4. **Persistence**: The document state can be trivially persisted by executing `localStorage.setItem(ART_KEY, art.innerHTML)` inside `toggleEdit` when edit mode is toggled off (`editing === false`). This will work seamlessly with the existing startup load mechanism.

## Caveats
- Splitting the pattern into 32-character chunks implies that if *every* 32-character window in a massive quote contains an edit, `match_main` will still fail. However, for real-world document editing, it is highly unlikely to have contiguous edits across every single chunk without breaking the fuzzy intent.
- `Match_Distance = 1000000` will force bitap to scan the entire string, but because Bitap operates via bitwise shifts, performance degradation in standard documents is statistically zero.
- Returning `orphaned` on 0 context matches means comments safely detach instead of guessing; users will need to manually reattach them if the quote isn't unique.

## Conclusion
The bugs stem from limitations in the diff algorithm payload size, unsafe defaults in disambiguation, and unmanaged overlapping UI state. 
Fix Strategy:
- Replace the 32-char substring in `fuzzyFind` with a chunking loop that scans offsets.
- Increase `Match_Distance` to `1000000`.
- Return `orphaned` if context matching score is exactly 0.
- Close `mergepop` on new reattach flows and guard the `reattachId` reset.
- Save `art.innerHTML` to `localStorage` on exiting edit mode.

## Verification Method
1. Launch `spike-collab/index.html`.
2. Edit the first 32 characters of a long commented paragraph; the comment should become "stale" instead of "orphaned" (verifies fuzzy match chunking).
3. Clone an exact sentence twice, edit the context around the commented one, and verify it goes to "orphaned" rather than pointing to the wrong sentence (verifies teleport fix).
4. Click "Re-attach" on Comment 1, then click "Re-attach" on Comment 2, then confirm the modal. Verify Comment 2 remains in "Pick / select..." mode (verifies race condition).
5. Toggle "Edit mode", add text, toggle off, refresh page; changes should persist (verifies `localStorage` fix).
