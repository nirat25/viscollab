# Iteration 2 Failure Report

Iteration 2 failed the gate because Challengers found severe logical flaws. 
The Forensic Auditor reported a CLEAN verdict, meaning no integrity violations occurred, but the functionality is flawed.

## Bugs Discovered:
1. **Fuzzy Matching Logic Flaws**:
   - The `fuzzyFind` function incorrectly truncates the pattern to the first 32 characters (`quote.substring(0, 32)`). If an author edits the first 32 characters of a long paragraph, `diff_match_patch.match_main` completely fails and returns `-1`, orphaning the comment even if the rest of the span is untouched.
   - The `Match_Distance = 1000` parameter is too restrictive. If a paragraph is moved significantly within a long document, fuzzy match will fail to locate it.

2. **Disambiguation / Anchor Teleportation**:
   - The PRD requirement "never silently re-point" fails. Disambiguation logic silently teleports the anchor to the first occurrence if the surrounding context is edited.

3. **Merge UX State Race Condition**:
   - The global `reattachId` can be overwritten if a user clicks "Re-attach" on a second comment while the confirmation modal for the first comment is open. Confirming the modal then incorrectly clears `reattachId`, aborting the second workflow.

4. **Persistence Limitation**:
   - The document edits themselves are not persisted across reloads, which limits end-to-end testing of identity persistence over multiple sessions. (This is a spike, so simple localstorage may suffice, but should be addressed).

## Instructions for Explorers:
You are to propose fix strategies for these 4 issues in the `spike-collab` codebase. Do NOT implement the code; just propose the strategy in your handoff report.
