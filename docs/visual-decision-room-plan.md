# Viscollab Rebuild Plan: Visual Decision Rooms

Last updated: 2026-07-13 (backlog section added; plan body unchanged since 2026-07-09)

## Summary

Rebuild the product around this core pipeline:

**Founder/internal strategy prose -> semantic decision model -> executive visual reasoning artifact -> account-gated collaborative decision room.**

Locked decisions:
- Primary user: founder/internal strategy owner.
- First lovable moment: visual clarity, not agent theatrics.
- Visual language: calm "executive cognition," not whiteboard chaos.
- V1 visual set: decision brief, mind map, argument map, tradeoff matrix, risk map, timeline, action checklist.
- AI agents: behind the scenes first; visible value comes from critique, extraction, grounding, and reviewer prompts.
- Migration: big TipTap/ProseMirror rebuild. Do not spend meaningful effort polishing the current raw-HTML shell.

## Core Architecture

### Canonical Data Model

Add a canonical `SemanticArtifact` model under `app/src/semantic/`.

Minimum v1 public types:
- `SemanticArtifact`
- `SemanticNode`
- `DecisionNode`
- `ClaimNode`
- `EvidenceNode`
- `AssumptionNode`
- `RiskNode`
- `OptionNode`
- `TradeoffNode`
- `ActionNode`
- `QuestionNode`
- `StakeholderNode`
- `VisualPlan`
- `VisualBlock`
- `AgentBrief`

Every semantic node must include:
- stable `id`
- `kind`
- `title`
- `summary`
- `sourceRefs`
- `sourceStatus`: `explicit | inferred | missing_evidence`
- optional relationships: `supports`, `contradicts`, `dependsOn`, `blocks`, `ownedBy`

New canonical pipeline:

`Input doc -> TipTap source IR -> SemanticArtifact -> VisualPlan -> TipTap decision room document -> React visual NodeViews`

### Rendering Stack

Install and use:
- `@tiptap/react`
- `@tiptap/starter-kit`
- `@tiptap/extension-table`
- `@tiptap/extension-link`
- `@xyflow/react`

TipTap becomes the durable review canvas. `@xyflow/react` renders graph-like reasoning views: mind map, argument map, risk/dependency map.

The LLM must not emit arbitrary final HTML. It emits structured semantic JSON and visual block specs only.

### Collaboration Model

Replace DOM-first comments with semantic-first anchors:
- primary: `{ artifactId, versionId, semanticNodeId, visualBlockId? }`
- secondary: TipTap node/range position
- fallback: existing text quote/path/hash anchor model

A reviewer should be able to comment on "Risk R2," "Option B," or "Assumption A4," not only highlighted text.

## Implementation Phases

### Phase 0: Product And Source-Of-Truth Reset

1. Update `htmlcollab-prd-and-plan.md` for the new thesis: founder/internal strategy docs become primary; PM/marketing signoff docs become included downstream use cases.
2. Replace "HTML artifact" language with "semantic visual decision room."
3. Resolve the source-of-truth conflict: after import, minor edits happen in the artifact/model; major rethinks happen through re-import as a new artifact.
4. Update `docs/ADR_Tech_Stack.md`: TipTap/ProseMirror accepted; semantic model is canonical; HTML is only a projection/export.
5. Define product vocabulary: Strategy Doc, Decision Room, Visual Brief, Review, Agent Brief.
6. Add account-required access rule: no anonymous public viewing in v1.
7. Write flagship acceptance test: upload founder strategy memo -> see BLUF, mind map, tradeoffs, risks, actions, and review rail.

### Phase 1: Semantic Model Foundation

1. Add `app/src/semantic/types.ts`.
2. Add runtime validation in `app/src/semantic/schema.ts`.
3. Add `app/src/semantic/sourceTrace.ts` to map nodes back to source IR text.
4. Add fixtures from existing sample docs plus one new founder strategy memo fixture.
5. Add tests for duplicate IDs, missing source refs, dangling relationships, invalid node kinds, and missing decision summary.
6. Extend `PipelineResult` to include `semanticArtifact`, `visualPlan`, and `agentBrief`.
7. Keep current HTML conversion only as a temporary legacy reference, not as the target renderer.

### Phase 2: Semantic Extraction

1. Add `app/src/semantic/extract.ts`.
2. Build an LLM prompt that extracts thesis, decisions, claims, evidence, assumptions, risks, options, tradeoffs, actions, questions, and stakeholders.
3. Require source refs for every extracted node.
4. Add deterministic mock extraction for tests without API keys.
5. Add semantic extraction eval rubric:
   - main decision identified
   - no invented facts
   - material risks captured
   - assumptions separated from evidence
   - options/tradeoffs captured
   - actions preserved
6. Add a debug CLI output for inspecting extracted semantic JSON.

### Phase 3: Visual Planning

1. Add `app/src/visual/types.ts`.
2. Add `app/src/visual/plan.ts`.
3. Generate ordered visual blocks:
   - `decisionBrief`
   - `mindMap`
   - `argumentMap`
   - `tradeoffMatrix`
   - `riskMap`
   - `timeline`
   - `actionChecklist`
   - `openQuestions`
4. Use deterministic planner rules:
   - options/tradeoffs -> tradeoff matrix
   - claims/evidence/objections -> argument map
   - risks/assumptions -> risk map
   - actions/dates -> timeline/action checklist
   - related concepts -> mind map
5. Validate that every visual block references existing semantic node IDs.
6. Omit weak visual blocks instead of padding or hallucinating.

### Phase 4: TipTap Decision Room Canvas

1. Add TipTap dependencies to `web/package.json`.
2. Create `web/src/components/tiptap/SemanticArtifactEditor.tsx`.
3. Implement read/review mode first, not editing.
4. Add custom TipTap block nodes:
   - `decisionBriefBlock`
   - `mindMapBlock`
   - `argumentMapBlock`
   - `tradeoffMatrixBlock`
   - `riskMapBlock`
   - `timelineBlock`
   - `actionChecklistBlock`
   - `sourceExcerptBlock`
5. Render blocks with React NodeViews.
6. Store TipTap JSON as a projection generated from `SemanticArtifact + VisualPlan`.
7. Add serialization/deserialization tests for every custom node.
8. Remove product dependency on `DocumentSurface.innerHTML` once parity exists.

### Phase 5: Visual Component Library

1. Add `web/src/components/visual/DecisionBrief.tsx`.
2. Add `MindMapView.tsx` using `@xyflow/react`.
3. Add `ArgumentMapView.tsx` using `@xyflow/react`.
4. Add `TradeoffMatrix.tsx`.
5. Add `RiskMap.tsx`.
6. Add `TimelineView.tsx`.
7. Add `ActionChecklist.tsx`.
8. Add `OpenQuestions.tsx`.
9. Every visual node must expose `data-semantic-node-id`.
10. Add a fixture preview route for visual QA.
11. Use restrained executive styling: light surface, high readability, minimal decoration, no dark/glass dashboard feel.

### Phase 6: Decision Room UI Rebuild

1. Split the current `web/src/app/page.tsx` into focused components.
2. Add `web/src/components/decision-room/DecisionRoomLayout.tsx`.
3. Layout:
   - top decision/status bar
   - center TipTap visual artifact
   - right review rail
   - collapsible workspace/document nav
4. First viewport must show:
   - room title
   - BLUF
   - decision status
   - visual tabs: Brief, Map, Tradeoffs, Risks, Actions, Source
5. Replace "Alignment Sign-off Verdicts" with "Decision status."
6. Remove hard-coded seeded reviewers from new documents.
7. Add empty state: "Import your first strategy memo."
8. Preserve account-required onboarding and route invited viewers directly to the decision room after signup.

### Phase 7: Semantic Comments And Review Rail

1. Extend `app/src/collab/comments.ts` with `SemanticCommentTarget`.
2. Update comment creation to prefer semantic node anchors.
3. Keep text/element anchors only as fallback for source text.
4. Redesign review rail groups:
   - Blockers
   - Risks
   - Questions
   - Decisions
   - Actions
   - Resolved
5. Add linked hover between visual node and comment card.
6. Add filters: unresolved, mine, blockers, stale.
7. Add "resolved with change in vN" history tied to semantic node/version.
8. Add tests for semantic comment anchoring and fallback behavior.

### Phase 8: Agent-Ready Layer

1. Add `app/src/agent/types.ts` with `AgentBrief`.
2. Generate agent brief from semantic model:
   - decisions needed
   - blockers
   - unsupported assumptions
   - action items
   - suggested reviewer questions
   - follow-up tasks
3. Add grounded "Ask this decision room" API.
4. Require citations to semantic node IDs/source refs in every answer.
5. Add presets: Founder, CFO, CTO, PM, Investor.
6. Add export endpoint for semantic JSON, visual plan, comments summary, and open actions.
7. Keep visible AI subtle: "Review assistant" and "Suggested questions," not named fake agents in v1.
8. Add groundedness eval tests.

### Phase 9: Persistence And Compatibility

1. Short term: extend current document version state to store `semanticArtifact`, `visualPlan`, `tipTapDoc`, and `agentBrief`.
2. Add repository/adapters so UI does not depend directly on blob shape.
3. Medium term: migrate Postgres storage to tables for documents, versions, semantic artifacts, visual plans, comments, verdicts, and agent runs.
4. Keep JSON fallback for local dev.
5. Add compatibility migration for existing raw HTML documents into a legacy/source view.
6. Add RBAC checks for semantic comments, verdicts, edits, and agent export.

### Phase 10: Lovable Launch Loop

1. Replace generic conversion progress with:
   - reading strategy memo
   - extracting decisions
   - mapping tradeoffs
   - finding risks
   - building visual decision room
2. Add conversion result summary: "Found 1 decision, 4 risks, 3 tradeoffs, 6 actions."
3. Add generated room title and one-sentence summary.
4. Add account-required invite flow for viewers.
5. Add non-surveillance metrics:
   - time to decision
   - blockers resolved
   - unresolved risks
   - relitigation tag
6. Revisit naming before final visual polish. Working positioning: "visual decision rooms for strategy."

## Granular Agent Task Queue

1. `DOC-001`: Update PRD positioning and anti-scope.
2. `DOC-002`: Update ADR for semantic model + TipTap rebuild.
3. `SEM-001`: Add semantic model TypeScript types.
4. `SEM-002`: Add semantic validator.
5. `SEM-003`: Add source trace helpers.
6. `SEM-004`: Add founder strategy memo fixture.
7. `SEM-005`: Add semantic validation tests.
8. `SEM-006`: Add semantic extraction prompt builder.
9. `SEM-007`: Add mocked extraction path.
10. `SEM-008`: Add semantic extraction eval rubric.
11. `VIS-001`: Add visual plan types.
12. `VIS-002`: Add deterministic visual planner.
13. `VIS-003`: Add visual plan validator.
14. `TIP-001`: Install TipTap and graph dependencies.
15. `TIP-002`: Add read-only TipTap editor shell.
16. `TIP-003`: Add decision brief TipTap node.
17. `TIP-004`: Add graph block TipTap node.
18. `TIP-005`: Add serialization tests.
19. `VISUI-001`: Build DecisionBrief component.
20. `VISUI-002`: Build MindMapView.
21. `VISUI-003`: Build ArgumentMapView.
22. `VISUI-004`: Build TradeoffMatrix.
23. `VISUI-005`: Build RiskMap.
24. `VISUI-006`: Build TimelineView.
25. `VISUI-007`: Build ActionChecklist.
26. `ROOM-001`: Extract page shell from current `page.tsx`.
27. `ROOM-002`: Build DecisionRoomLayout.
28. `ROOM-003`: Add visual tabs.
29. `ROOM-004`: Add first-run empty state.
30. `ROOM-005`: Remove seeded reviewer names for new docs.
31. `COLLAB-001`: Add semantic comment target.
32. `COLLAB-002`: Update comment composer for semantic anchors.
33. `COLLAB-003`: Group review rail by semantic kind.
34. `COLLAB-004`: Add visual-node/comment hover linking.
35. `AGENT-001`: Add AgentBrief type.
36. `AGENT-002`: Generate AgentBrief from semantic fixture.
37. `AGENT-003`: Add grounded ask API skeleton.
38. `AGENT-004`: Add citation validation tests.
39. `E2E-001`: Replace skipped e2e seeding with script-based fixture seed.
40. `E2E-002`: Add import-to-decision-room smoke test.
41. `E2E-003`: Add desktop screenshot test.
42. `E2E-004`: Add mobile screenshot test.

## Test Plan

Deterministic:
- semantic schema validation
- source trace validation
- visual plan validation
- TipTap node serialization
- semantic comment anchoring
- RBAC for viewer/commenter/collaborator/owner
- legacy document compatibility

Eval:
- no fabricated decisions, risks, actions, or numbers
- correct main decision identification
- risk/assumption/evidence separation
- visual plan usefulness
- agent answer groundedness

Browser:
- signup/signin required
- first import flow
- decision room render
- visual tab interactions
- semantic comment creation
- viewer cannot edit
- collaborator can comment
- mobile layout

Manual:
- upload one real founder strategy memo
- verify first screen clicks within 30 seconds
- verify maps clarify rather than decorate
- verify reviewer knows exactly what decision is requested

## Assumptions

- Big rebuild means the new TipTap decision room replaces the current raw-HTML review surface; current `DocumentSurface` is retained only as temporary legacy/reference until parity.
- AI-agent value remains behind the scenes in v1.
- Account creation is required for all roles, including viewers.
- `@xyflow/react` is the graph library unless implementation proves it unsuitable.
- Founder strategy memo is the flagship demo artifact.

## Backlog (deferred items — added 2026-07-13, owner-directed)

Accumulated from the Phase 1–5 review rounds and the owner's visual checkpoints. None block
Phase 6; pick up opportunistically or as a dedicated polish pass. IDs are stable for reference.

Graph polish (from the owner's Phase-5 visual review):
1. `BACK-001` — Direction-aware mind-map layout: `supports`/inward arrows currently sweep back
   across the canvas center on dense maps (layout grows outward from the root while support
   arrows point inward). Seat supporters on the side their arrow points to, or use routed
   orthogonal edges. Today color-coding keeps them traceable; revisit if real memos produce
   dense hubs.
2. `BACK-002` — `FlowCardNode` handle slots are modulo-3: a card with >3 parallel edges on one
   side reuses a slot. Make slot count adaptive to edge count.
3. `BACK-003` — TradeoffMatrix cell semantics are crude-but-grounded (a dimension's summary
   repeats in every related option's cell). Consider per-cell values in the semantic model
   (extraction change) or smarter cell text derivation.

Code-quality nits (from Opus reviews of Phases 1–3 and 5):
4. `BACK-004` — Semantic validator: error on non-string relationship refs instead of silently
   skipping (`app/src/semantic/schema.ts`).
5. `BACK-005` — Surface dropped relationship refs programmatically (`SemanticPipelineResult.warnings`)
   instead of `console.warn` only (`app/src/semantic/extract.ts`).
6. `BACK-006` — Timeline `due` sort is lexicographic across mixed ISO dates and phrases
   ("This quarter"); normalize or document per-block (`app/src/visual/plan.ts`).
7. `BACK-007` — `blockPath` validation accepts text-leaf terminals; tighten to block-level paths
   (`app/src/semantic/sourceTrace.ts`).
8. `BACK-008` — `data-visual-block-id` is rendered by BOTH the NodeView wrapper and each leaf
   component root; pick ONE owner (suggest leaf) **before Phase 7 hover-linking is built on it**.
9. `BACK-009` — RiskMap ARIA: aria-label only today; add proper table/row/cell roles if screen-reader
   support becomes a requirement.
10. `BACK-010` — Type `FlowCardNode` as `NodeProps<Node<FlowCardData>>` to drop the internal cast;
    define or remove the unused `dr-timeline-body` class; unify `.dr-*` top-level vs
    nested-under-root CSS convention (`web/src/components/visual/shared.tsx`, `decision-room.css`).

Pipeline/eval:
11. `BACK-011` — Eval regression harness: run the semantic rubric judge over a golden set from the
    CLI; seed it with the observed LLM variance mode (quotes stitched with "…"/paraphrase — caught
    deterministically by `validateSourceTrace`; extraction prompt v2 forbids it).
12. `BACK-012` — ~~Decide golden-fixture access for web mock mode~~ **DECIDED at Phase 6 wiring
    (2026-07-14):** heuristic-only web mock mode accepted — no fixtures export from the package;
    `mockExtract`'s heuristic fallback is deterministic and always schema-valid, sufficient for
    web mock/e2e. Decision recorded in a code comment in
    `web/src/app/api/collab/convert/route.ts`.

Phase 6 review round (added 2026-07-14, from the Opus review of ROOM-001..005 — none blocked the gate):
13. `BACK-013` — `VisualTabs` initial tab is always "brief"; for a degenerate artifact whose planner
    omitted `decisionBrief` the default tab renders an empty editor. Default to the first enabled tab.
14. `BACK-014` — The 3s poll never clears `semanticArtifact`/`visualPlan` back to `undefined`
    (guarded by `!== undefined`), asymmetric with `loadDocumentState`. Only matters if an artifact
    is removed server-side while the doc stays active.
15. `BACK-015` — Per-tab `key={activeTab}` remount of `SemanticArtifactEditor` recreates
    ProseMirror (+xyflow on Map) on each tab switch. Correct but a perf cost; consider keep-alive
    if tab-switching feels sluggish on large rooms.
16. `BACK-016` — Remaining dark/glass chrome inside the room: convert/create/sandbox modals, tour
    toast, and the reused `CommentSidebar` rail. Allowed under C1's Phase-10 deferral (untouched
    legacy components), but they are now the only non-light chrome in the decision room — fold into
    the Phase 10 launch-polish re-theme (rail itself is redesigned in Phase 7).
17. `BACK-017` — Pre-existing: a fresh account's client defaults `activeDocumentId` to `doc-1`, so
    the 3s poll 403s against the legacy demo doc until the user opens one of their own documents.
    Harmless but noisy in server logs; consider deferring polling until a doc the user can read is
    active.

Phase 7 review round (added 2026-07-14, from the Opus review — none blocked the gate):
18. `BACK-018` — Defense-in-depth: `handleAddComment`/`handleAddReply` don't re-check `canComment`
    on submit (all composer-OPEN gestures are gated and the server enforces on the `comments` key;
    pre-existing, unchanged by Phase 7). Add the submit-side check when touching these handlers.
19. `BACK-019` — Comment-count badge positioning on `TradeoffMatrix` header cells: the generic
    `[data-semantic-node-id]{position:relative}` + `::after` pill can sit oddly on `<th>` cells.
    Cosmetic only; tune when polishing.
