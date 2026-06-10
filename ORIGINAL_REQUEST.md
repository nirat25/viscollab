# Original User Request

## Initial Request — 2026-06-08T18:11:12Z

Implement the next three milestones for the HTMLCollab MVP: writing the Phase 1 Stack Decision ADR (P1-T3), completing the Phase 2 collaboration layer polish (P2-T4), and implementing design profiles in the conversion system.

Working directory: c:/Users/nirat/OneDrive/Continuing_Education/Portfolio/Viscollab
Integrity mode: development

## Requirements

### R1. P1-T3: Stack Decision ADR
Research and write an Architecture Decision Record (ADR) deciding the frontend framework, LLM provider + model tiers, storage layer, and IR format. 
- You have free rein on the tech stack.
- You must spawn or consult a "Principal (L8) Engineer" agent/persona to review and weigh in on the tech stack decision before finalizing the ADR.

### R2. P2-T4: Collaboration Polish
Implement the remaining P2-T4 polish in `spike-collab`: orphan re-attach merge UX, fuzzy matching for longer spans using diff-match-patch, and mock identity/persistence.

### R3. Design Profiles in Conversion
Inject composable design guidance (e.g., Tufte, exec-brief) into the convert system prompt (`spike/src/convert.ts` and `template.ts`) so the LLM can auto-pick or select design profiles per doc/section.

## Acceptance Criteria

### Stack Decision ADR
- [ ] An ADR document is created detailing the chosen frontend framework, LLM provider, storage, and IR format.
- [ ] The ADR contains an explicit section detailing the consultation and review notes from the "L8 Engineer" persona.

### Collaboration Polish Verification
- [ ] Automated tests are implemented to verify that comments re-attach correctly, fuzzy matching works for long spans, and identity persists.
- [ ] All automated tests pass successfully. (You may install and use Playwright or a similar tool for browser tests).

### Design Profiles Verification
- [ ] Evaluation criteria for the design profiles are added to the existing `npm run eval` harness.
- [ ] A separate "Agent as a Judge" evaluation script/mechanism is created and run to explicitly verify the structure and quality of the generated HTML.
