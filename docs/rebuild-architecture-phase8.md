# Viscollab Rebuild — Architecture Brief (Phase 8: Agent-Ready Layer)

Date: **2026-07-19**. Status: **BINDING for Phase 8**. Subordinate to
`docs/rebuild-architecture.md` §0 and `docs/rebuild-architecture-phase7.md` where Phase-7 contracts
remain relevant. Where `docs/visual-decision-room-plan.md` Phase 8 / `AGENT-001..004` is ambiguous,
the decisions here win.

Implements Phase 8 requirements 1–8 and task queue `AGENT-001..004`. The owner's 2026-07-19 request
clears the post-Phase-7 UX checkpoint. Phase 9 persistence and agent-run history remain out of scope.

## 0. Non-negotiable boundaries

1. `app/` stays framework-free and owns all deterministic AgentBrief, grounding, citation, export,
   and eval contracts. `web/` owns authenticated route handlers and the subtle UI.
2. Any `app/src` change is followed by `cd app && npm run build` before web work/tests.
3. The browser sends only `documentId`, question, and perspective. It never sends the artifact,
   plan, comments, or citations to Ask/Export. Routes load canonical state server-side after auth.
4. Model output contains answer prose plus semantic node IDs/source-ref indexes only. Quote text,
   titles, kinds, and offsets are materialized from the canonical artifact after validation.
5. Invalid or ungrounded model output fails closed. It is never rendered as a best-effort answer.
6. AgentBrief is pure/deterministic and generated on demand. It is NOT persisted in Phase 8;
   Phase 9 owns blob/repository persistence and agent-run history.
7. Visible AI is “Review assistant” / “Suggested questions.” No avatars, named fake agents, chat
   theater, typing theater, autonomous calls, or surprise spend.
8. Legacy raw-HTML documents keep their current surface and rail. Ask/Export require a semantic room.

## 1. Public app module

Add public entrypoint `htmlcollab-app/agent`:

```
app/src/agent/types.ts
app/src/agent/brief.ts
app/src/agent/schema.ts
app/src/agent/ask.ts
app/src/agent/mock.ts
app/src/agent/export.ts
app/src/agent/rubric.ts
app/src/agent/index.ts
```

Add `"./agent": "./dist/agent/index.js"` to `app/package.json` exports.

The Phase-1 forward stub `AgentBrief` currently in `semantic/types.ts` moves to `agent/types.ts`.
`semantic/index.ts` re-exports it as a compatibility type; `pipeline.ts` imports it from
`./agent/types.js`. No runtime semantic→agent dependency is introduced.

## 2. Binding types

```ts
export type AgentPreset = "founder" | "cfo" | "cto" | "pm" | "investor";

export interface AgentFollowUpTask {
  semanticNodeId: SemanticNodeId;
  reason: "open_action" | "open_question" | "validate_assumption";
}

export interface SuggestedReviewerQuestion {
  text: string;
  semanticNodeIds: SemanticNodeId[];
}

export interface AgentBrief {
  schemaVersion: 1;
  artifactId: string;
  decisionsNeeded: SemanticNodeId[];
  blockers: SemanticNodeId[];
  unsupportedAssumptions: SemanticNodeId[];
  actionItems: SemanticNodeId[];
  suggestedQuestions: SuggestedReviewerQuestion[];
  followUpTasks: AgentFollowUpTask[];
}

export interface RawAgentCitation {
  semanticNodeId: SemanticNodeId;
  sourceRefIndex: number;
}

export interface RawAgentAnswer {
  answer: string;
  citations: RawAgentCitation[];
  insufficientEvidence?: boolean;
}

export interface GroundedCitation extends RawAgentCitation {
  nodeKind: SemanticNodeKind;
  nodeTitle: string;
  quote: string;
  charStart?: number;
  charEnd?: number;
}

export interface GroundedAgentAnswer {
  schemaVersion: 1;
  artifactId: string;
  preset: AgentPreset;
  answer: string;
  citations: GroundedCitation[];
  insufficientEvidence: boolean;
  model: string;
  simulated: boolean;
}
```

`AGENT_PRESETS` and the display labels/lens guidance are exported constants. Presets alter emphasis,
never facts, permissions, or citation requirements.

## 3. Deterministic AgentBrief

`generateAgentBrief(artifact)` is pure, stable in artifact node order, de-duplicated, and bounded.

- `decisionsNeeded`: decision nodes whose status is not `decided`.
- `blockers`: decisions with status `blocked`, plus nodes with a non-empty `relationships.blocks`.
- `unsupportedAssumptions`: assumption nodes with `sourceStatus === "missing_evidence"`, or without
  an incoming relationship from an evidence node's `supports` list.
- `actionItems`: action nodes whose `done !== true`.
- `suggestedQuestions`: explicit question nodes first, then stable templates for decisions,
  blockers, unsupported assumptions, and material risks; each question carries grounding node IDs.
  Maximum 8 in the AgentBrief; the UI shows at most 5.
- `followUpTasks`: open actions, open questions, and assumption-validation items by node ID/reason.

`validateAgentBrief(value, artifact)` follows the hand-rolled `{valid, errors[]}` convention. It
rejects wrong schema/artifact IDs, duplicate/dangling/wrong-kind IDs, empty/ungrounded questions, and
invalid follow-up reasons.

## 4. Grounded Ask

Extend the provider client with role `ask`, `ASK_MODEL`, and `ASK_MODEL_FALLBACKS`. Defaults use the
fast tier (`claude-haiku-4-5` / `gpt-4o-mini`); maximum completion is 2,048 tokens.

App functions:

- `buildAskPrompt(artifact, question, preset)` — semantic JSON only; source content is delimited as
  untrusted data. No HTML, auth, members, notifications, or opaque state.
- `parseRawAgentAnswer(completion)` — defensive JSON-fence stripping, otherwise strict JSON.
- `validateRawAgentAnswer(raw, artifact)` — validates answer/citation shape, node existence,
  integer in-range source indexes, non-empty canonical refs, maximum 8 citations, and the
  insufficient-evidence contract.
- `materializeGroundedAnswer(raw, artifact, preset, model, simulated)` — hydrates canonical quote,
  title, kind, and offsets. It never trusts model-supplied quote text.
- `askDecisionRoom(artifact, question, preset)` — provider call + strict validation/materialization.
- `mockAskDecisionRoom(artifact, question, preset)` — stable key-free lexical retrieval, cites the
  first valid source ref of selected nodes, and falls back to the primary decision or the standard
  insufficient-evidence response.

Substantive answers require at least one valid citation. A citation-free response is allowed only
when `insufficientEvidence === true` and the answer is the exported standardized insufficient-evidence
message. Missing-evidence nodes cannot be used as factual citations.

## 5. Web Ask route

Add `POST /api/collab/ask`:

```json
{"documentId":"doc-...","question":"...","preset":"founder"}
```

Processing order: parse/allowlist/trim (question 1–2,000 chars) → session → direct document membership
via `getDocumentRole` → load state → validate stored SemanticArtifact → ask quota → explicit mock or
real provider → no-store response. All document roles may Ask because they can already read the room.

Mock mode is allowed only for `MOCK_AI=true` or the non-production Playwright bypass. Missing real
provider configuration returns 503; it never silently simulates in production. Add an explicit `ask`
quota and `MAX_DAILY_ASKS`; do not count asks as edits.

Stable statuses: 400 invalid request; 401 unauthenticated; 403 non-member; 404 state missing; 409
legacy/no semantic room; 422 invalid stored artifact; 429 quota; 502 malformed/ungrounded provider
output; 503 provider unavailable; 500 opaque internal failure. Do not return raw provider errors.
Every response uses `Cache-Control: private, no-store`.

## 6. Export

Add pure `buildDecisionRoomExport(...)` plus
`GET /api/collab/export?documentId=...`. In Phase 8 export is deliberately restricted to owner and
collaborator (`canEdit`) until Phase 9 introduces a dedicated capability.

Payload contains only:

- `schemaVersion`, `exportedAt`, `documentId`, `artifactId`
- canonical `semanticArtifact`
- validated `visualPlan` (recompute deterministically if absent/invalid)
- generated `agentBrief`
- deterministic `commentsSummary` (counts + open thread records)
- open action nodes (`done !== true`)

Never export versions/raw HTML, members, tokens, notifications, usage data, or view/read state.
Headers: `application/json; charset=utf-8`, safe attachment filename,
`Cache-Control: private, no-store`, and `X-Content-Type-Options: nosniff`.

## 7. UI integration

Add `ReviewAssistant.tsx`, rendered at the top of the semantic `ReviewRail`:

- “Review perspective” native select: Founder (default), CFO, CTO, PM, Investor.
- 3–5 suggested-question buttons; clicking only fills the input.
- Explicit Ask submit; one latest answer, not persistent chat history.
- Plain answer + canonical citation chips; loading “Reviewing the room…”.
- Abort in-flight fetch on document switch/unmount; keyed by document ID to prevent state leakage.
- Proper labels, `aria-live`, `role=status`, `role=alert`, visible focus, no mobile autofocus.

Add `DecisionRoomExportButton.tsx` to the semantic room's canvas topline. It downloads the server
attachment, revokes the object URL, and surfaces failure. Label: “Export room data.”

The existing header's semantic-room toggle copy becomes “Review” (legacy remains “Comments”) and gets
`aria-expanded` / `aria-controls`. The rail gets `aria-label="Decision room review"`; filter buttons
get `aria-pressed`.

Mobile: tab strip horizontally scrolls with auto-width tabs; canvas topline wraps; assistant controls
stack; suggested-question buttons wrap and keep a 44px target. Existing Phase-7 keyboard debt for
clickable visual nodes/comment cards is documented, not expanded into this phase.

## 8. Tests and gate

Offline app Vitest:

- AgentBrief classifications, validation, ordering, bounds, no mutation, sparse artifacts.
- Preset allowlist/lens guidance.
- Ask prompt determinism, parse/fence handling, canonical citation hydration, every invalid citation
  case, standardized insufficient-evidence path, deterministic mock/no invented quote text.
- Export counts/open threads/open actions and absence of forbidden state.
- Provider ask defaults/override/fallback/OpenRouter/providerInfo.
- Export RBAC helper: owner/collaborator yes; commenter/viewer no.

Eval-only groundedness rubric: citation completeness, citation entailment, no unsupported facts/numbers
(zero tolerance), missing-evidence acknowledgement, and preset usefulness. Never exact-string test LLM
prose.

Browser gate (manual or focused Playwright after safe script seeding exists): semantic room shows the
assistant; suggested question does not auto-call; mock/real answer citations resolve to canonical nodes;
export downloads the required shape; legacy remains unchanged; mobile 375px has no page overflow.

Gate commands:

```bash
cd app && npm run typecheck && npm run build && npx vitest run
cd web && npx tsc --noEmit && npm run build
```

Real-LLM gate: at least one founder-memo Ask returns a valid grounded answer and passes citation
validation. The offline mock remains the CI path.

## 9. Non-goals

No persisted AgentBrief/agent runs/chat history (Phase 9). No autonomous actions or notifications. No
multi-agent personas. No web search or external data. No HTML/TipTap generation by the Ask model. No
anonymous access. No migration of legacy docs. No E2E reset HTTP endpoint; `E2E-001..004` require the
separate safe script-seeding wave and do not block the app/web Phase-8 implementation gate.
