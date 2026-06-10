# Plan

1. Assess current repository state.
2. Initialize `PROJECT.md` and define milestones.
3. Milestone 1: P1-T3 Stack Decision ADR
   - Spawn sub-orchestrator or iteration loop.
   - Requires a consultation with a Principal (L8) Engineer persona.
   - Outcome: ADR document with explicit L8 consultation section.
4. Milestone 2: P2-T4 Collaboration Polish
   - Spawn sub-orchestrator for `spike-collab` changes.
   - Implement: orphan re-attach merge UX, fuzzy matching for longer spans using diff-match-patch, mock identity/persistence.
   - Tests: Automated browser tests (e.g., Playwright) verifying re-attach, fuzzy matching, identity persistence.
5. Milestone 3: Design Profiles in Conversion
   - Spawn sub-orchestrator for `spike/src/convert.ts` and `template.ts` changes.
   - Implement: Composable design guidance in system prompt.
   - Eval: Add to `npm run eval` harness.
   - Agent as a Judge: Create separate evaluation script/mechanism verifying structure and quality of generated HTML.
6. Verify all milestones and acceptance criteria.
7. Report victory to Sentinel.
