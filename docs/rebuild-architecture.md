# Viscollab Rebuild — Architecture Brief (Phases 0–6)

Status: BINDING. Builder agents (Sonnet) implement `docs/visual-decision-room-plan.md` by following
this document. Where the plan is ambiguous, the decision here wins and is marked **ARCH DECISION**.
Scope is Phases 0–6 only. Phases 7–10 are OUT — but every type below is designed to extend into them
(stable node IDs for comment anchoring, `AgentBrief` stub for the agent layer).

Read order for a builder: this file → the specific plan phase → the files named in the module map.

---

## 0. Ground rules (non-negotiable, enforced at review)

1. **Two packages, one direction.** `app/` is a framework-free TypeScript ESM library (`tsc` →
   `app/dist`, NodeNext, `"type": "module"`). `web/` (Next 16 + React 19) imports the **compiled**
   package via `htmlcollab-app/*` (`file:../app` + `transpilePackages`). **No React/Next/JSX/DOM-only
   globals in `app/src`.** New app modules live in `app/src/semantic/` and `app/src/visual/`.
2. **BUILD RULE (hard).** Any change to `app/src` requires `cd app && npm run build` **before** any web
   work or web test — `web` resolves `htmlcollab-app/*` against `app/dist`, so a stale dist fails web at
   import time. Every app-side task's DoD ends with "`npm run build` green + new export resolves."
3. **New public surface must be exported.** Add each new app entrypoint to `app/package.json`
   `exports` (see §2). Import as `htmlcollab-app/semantic`, `htmlcollab-app/visual`. `.js` extensions in
   relative imports inside `app/src` (NodeNext), e.g. `import { ... } from "./types.js"`.
4. **The LLM never emits HTML or TipTap.** Extraction emits **semantic JSON only**, validated by
   `app/src/semantic/schema.ts`. Planning and projection are **pure deterministic code**. If the model
   returns anything but the agreed JSON, extraction throws (caught → surfaced, never rendered raw).
5. **Validation is hand-rolled.** The repo validates by hand (`validateContract`, `validateDisclosure`
   use `node-html-parser` + manual checks). `zod` is only a transitive lockfile entry, **not** a source
   dep. Do NOT add zod. Match the existing style: pure functions returning a typed result object with a
   `valid: boolean` and an `errors: string[]`.
6. **Testing model.** Deterministic vitest for all non-LLM behavior (schema, sourceTrace, planner,
   projection round-trip) — runs in CI, **no keys**. LLM output quality is an **eval** (rubric + judge,
   run on demand with real keys) — never an exact-string unit assertion. The mock extraction path
   (§5) is deterministic and key-free so the whole app suite runs offline.
7. **Legacy stays.** `web/src/components/DocumentSurface.tsx` and its HTML review path keep working
   until TipTap reaches parity. New UI is **additive**. No deletion of the legacy path in this run.
8. **Design tenets.** Serve the reader; structure over decoration; calm "executive cognition" —
   **light** surface, high readability, minimal decoration, **NO dark/glass dashboard aesthetics**
   (see contradiction C1 in §11); the platform makes layout choices, not the author.

---

## 1. Canonical pipeline

```
Input doc → TipTapDoc IR (exists: app/src/ir.ts)
          → SemanticArtifact         (app/src/semantic/extract.ts | mock.ts, validated by schema.ts)
          → VisualPlan               (app/src/visual/plan.ts, validated by validate.ts) — PURE
          → TipTap decision-room doc (app/src/visual/project.ts → plain JSON) — PURE
          → React NodeViews          (web/src/components/tiptap/* + web/src/components/visual/*)
```

The semantic model is canonical. HTML is a legacy projection only. `sourceTrace.ts` maps every semantic
node back to a character span in the IR's plain text (`nodeToPlainText`, already in `ir.ts`).

---

## 2. Module map

New app modules (`exports` key → path). **Add every `exports` entry as part of the task that creates the file.**

| Path | Exports key | Responsibility | Imports |
|---|---|---|---|
| `app/src/semantic/types.ts` | `./semantic` (barrel) | All semantic + agent type defs (§3). Pure types, zero runtime. | `../ir.js` (type only) |
| `app/src/semantic/schema.ts` | `./semantic` | `validateSemanticArtifact()` hand-rolled runtime validator (§5). | `./types.js` |
| `app/src/semantic/sourceTrace.ts` | `./semantic` | Resolve/validate `sourceRefs` → char spans in IR plain text (§5). | `./types.js`, `../ir.js` |
| `app/src/semantic/extract.ts` | `./semantic` | LLM prompt builder + `extractSemantic(ir)` (calls client role `extract`). | `./types.js`, `./schema.ts`, `../convert/client.js`, `../ir.js` |
| `app/src/semantic/mock.ts` | `./semantic` | Deterministic, key-free extraction for tests/dev (§5). | `./types.js`, `../ir.js` |
| `app/src/semantic/rubric.ts` | `./semantic` | Eval-only extraction rubric (6 dimensions, §5). Mirrors `convert/rubric.ts`. | `./types.js` |
| `app/src/semantic/index.ts` | `./semantic` | Barrel re-export of the above. | all of the above |
| `app/src/visual/types.ts` | `./visual` | `VisualPlan`, `VisualBlock` union (8 kinds), tokens (§3, §4). | `./types.js`? no → `../semantic/types.js` |
| `app/src/visual/plan.ts` | `./visual` | `planVisuals(artifact): VisualPlan` — deterministic planner (§4). | `../semantic/types.js`, `./types.js` |
| `app/src/visual/validate.ts` | `./visual` | `validateVisualPlan(plan, artifact)` — every `nodeId` exists (§4). | `../semantic/types.js`, `./types.js` |
| `app/src/visual/project.ts` | `./visual` | **ARCH DECISION (adds a file the plan omitted):** pure `projectArtifact(artifact, plan): TipTapVisualDoc` (plain JSON) so TIP-005 round-trip tests are deterministic + key-free in the app vitest suite. Also exports `VISUAL_TIPTAP_NODE_NAMES`. | `../semantic/types.js`, `./types.js` |
| `app/src/visual/index.ts` | `./visual` | Barrel. | all visual/* |

New web modules (no `exports` map — normal Next imports):

| Path | Responsibility |
|---|---|
| `web/src/components/tiptap/SemanticArtifactEditor.tsx` | Read-only TipTap editor; loads projected JSON; provides `SemanticArtifactContext`. |
| `web/src/components/tiptap/nodes.ts` | 8 custom TipTap `Node` schema defs (atoms; attrs = ids only). Names from `VISUAL_TIPTAP_NODE_NAMES`. |
| `web/src/components/tiptap/SemanticArtifactContext.tsx` | React context holding `{artifact, plan}`; NodeViews read block/node data by id. |
| `web/src/components/visual/DecisionBrief.tsx` | + `MindMapView.tsx`, `ArgumentMapView.tsx`, `TradeoffMatrix.tsx`, `RiskMap.tsx`, `TimelineView.tsx`, `ActionChecklist.tsx`, `OpenQuestions.tsx` (§6). |
| `web/src/components/decision-room/DecisionRoomLayout.tsx` | + `TopDecisionBar.tsx`, `VisualTabs.tsx`, `ReviewRail.tsx`, `WorkspaceNav.tsx`, `EmptyState.tsx`, `DecisionRoomApp.tsx` (§7). |
| `web/src/app/decision-room.css` | Scoped **light** token layer for the room (see C1). Imported by `DecisionRoomLayout`. |
| `web/src/app/preview/visual/page.tsx` | Dev-only fixture preview route for visual QA (VISUI). Renders every component against fixtures. |

Fixtures:

| Path | Purpose |
|---|---|
| `app/tests/fixtures/founder-strategy-memo.md` | Flagship source doc (new; SEM-004). Realistic founder strategy memo. |
| `app/tests/fixtures/semantic/founder-memo.ir.json` | The memo ingested to `TipTapDoc` (fixture input; regenerate via a small script, do not hand-edit). |
| `app/tests/fixtures/semantic/founder-memo.artifact.json` | Golden `SemanticArtifact` for the memo — drives mock + deterministic tests + web preview. |
| `app/tests/fixtures/semantic/*.artifact.json` | Additional goldens converted from existing sample docs. |

---

## 3. TypeScript type sketches (BINDING — builders copy these verbatim)

### 3.1 Semantic model — `app/src/semantic/types.ts`

```ts
import type { TipTapDoc } from "../ir.js";

/** Opaque, STABLE node id. Format `${kindPrefix}_${n}` (e.g. "risk_2"), assigned in
 *  deterministic extraction order. Treat as opaque for identity/anchoring; do not parse.
 *  Stability matters: Phase 7 comment anchors key on this id. */
export type SemanticNodeId = string;

export type SemanticNodeKind =
  | "decision" | "claim" | "evidence" | "assumption" | "risk"
  | "option"   | "tradeoff" | "action" | "question" | "stakeholder";

export type SourceStatus = "explicit" | "inferred" | "missing_evidence";

/** A grounding pointer from a semantic node back into the source IR.
 *  `quote` is VERBATIM source text (enables no-fabrication checks + highlight).
 *  `charStart/charEnd` are into `nodeToPlainText(ir)` and are FILLED BY sourceTrace,
 *  not by the LLM. `blockPath` is an optional index path into TipTapDoc.content. */
export interface SourceRef {
  quote: string;
  blockPath?: number[];
  charStart?: number;
  charEnd?: number;
}

/** Directed relationships. Values are SemanticNodeIds (ownedBy → a stakeholder id). */
export interface SemanticRelationships {
  supports?: SemanticNodeId[];
  contradicts?: SemanticNodeId[];
  dependsOn?: SemanticNodeId[];
  blocks?: SemanticNodeId[];
  ownedBy?: SemanticNodeId[];
}

export interface SemanticNodeBase {
  id: SemanticNodeId;
  kind: SemanticNodeKind;
  /** Short human label for display/anchoring, e.g. "R2", "Option B". NOT the id. */
  label?: string;
  title: string;
  summary: string;
  sourceRefs: SourceRef[];
  sourceStatus: SourceStatus;
  relationships?: SemanticRelationships;
}

export interface DecisionNode extends SemanticNodeBase {
  kind: "decision";
  /** The one-line ask a reviewer must respond to. Required & non-empty (validator-enforced). */
  question: string;
  /** Recommended option id, if the memo states one. */
  recommendedOptionId?: SemanticNodeId;
  status?: "proposed" | "under_review" | "decided" | "blocked";
}
export interface ClaimNode      extends SemanticNodeBase { kind: "claim"; }
export interface EvidenceNode   extends SemanticNodeBase { kind: "evidence"; /** claim(s) it backs */ }
export interface AssumptionNode extends SemanticNodeBase { kind: "assumption"; }
export interface RiskNode extends SemanticNodeBase {
  kind: "risk";
  likelihood?: "low" | "medium" | "high";
  impact?: "low" | "medium" | "high";
}
export interface OptionNode   extends SemanticNodeBase { kind: "option"; }
export interface TradeoffNode extends SemanticNodeBase {
  kind: "tradeoff";
  /** A comparison DIMENSION (e.g. "cost", "time-to-ship"). Used as a matrix column. */
  dimension: string;
}
export interface ActionNode extends SemanticNodeBase {
  kind: "action";
  owner?: string;             // free text or resolved stakeholder label
  due?: string;               // ISO date or relative phrase ("This quarter")
  order?: number;             // planner sequence hint for timeline
  done?: boolean;
}
export interface QuestionNode    extends SemanticNodeBase { kind: "question"; }
export interface StakeholderNode extends SemanticNodeBase { kind: "stakeholder"; role?: string; }

export type SemanticNode =
  | DecisionNode | ClaimNode | EvidenceNode | AssumptionNode | RiskNode
  | OptionNode | TradeoffNode | ActionNode | QuestionNode | StakeholderNode;

export interface SemanticArtifact {
  schemaVersion: 1;
  /** Stable id for the artifact; comment anchors are {artifactId, versionId, semanticNodeId,...}. */
  id: string;
  sourceFile: string;
  title: string;               // generated room title
  /** BLUF: one-sentence bottom-line-up-front for the top bar. */
  bluf: string;
  thesis: string;              // the memo's central argument, plain
  primaryDecisionId?: SemanticNodeId; // the decision the brief anchors on
  nodes: SemanticNode[];       // flat list; relationships express the graph
  extractedBy: "mock" | string; // model id or "mock"
}

/** Phase-8 forward-compat stub ONLY. Defined now (plan lists it in v1 public types) but NOT
 *  generated in Phases 0–6. `PipelineResult.agentBrief` stays undefined until the agent layer. */
export interface AgentBrief {
  decisionsNeeded: SemanticNodeId[];
  blockers: SemanticNodeId[];
  unsupportedAssumptions: SemanticNodeId[];
  actionItems: SemanticNodeId[];
  suggestedQuestions: string[];
}
```

Kind-prefix map for ids (deterministic): `decision→decision`, `claim→claim`, `evidence→evidence`,
`assumption→assumption`, `risk→risk`, `option→option`, `tradeoff→tradeoff`, `action→action`,
`question→question`, `stakeholder→stakeholder`, then `_<n>` 1-based within kind, in extraction order.

### 3.2 Visual plan — `app/src/visual/types.ts`

```ts
import type { SemanticNodeId, SemanticArtifact } from "../semantic/types.js";

export type VisualBlockKind =
  | "decisionBrief" | "mindMap" | "argumentMap" | "tradeoffMatrix"
  | "riskMap" | "timeline" | "actionChecklist" | "openQuestions";

export interface VisualBlockBase {
  id: string;                 // stable, e.g. "vb_tradeoffMatrix" (one per kind in v1)
  kind: VisualBlockKind;
  title: string;
  /** EVERY semantic node id this block renders. Drives validate.ts + Phase-7 block anchoring. */
  nodeIds: SemanticNodeId[];
}

export interface DecisionBriefBlock extends VisualBlockBase {
  kind: "decisionBrief";
  decisionId?: SemanticNodeId; keyOptionIds: SemanticNodeId[];
  keyRiskIds: SemanticNodeId[]; keyActionIds: SemanticNodeId[];
}
export interface GraphEdge { from: SemanticNodeId; to: SemanticNodeId; relation: string; }
export interface MindMapBlock   extends VisualBlockBase { kind: "mindMap";   rootId: SemanticNodeId; edges: GraphEdge[]; }
export interface ArgumentMapBlock extends VisualBlockBase {
  kind: "argumentMap";
  claimIds: SemanticNodeId[];
  edges: Array<{ from: SemanticNodeId; to: SemanticNodeId; relation: "supports" | "contradicts" }>;
}
export interface TradeoffCell { optionId: SemanticNodeId; tradeoffId: SemanticNodeId; value: string; sentiment?: "pos" | "neg" | "neutral"; }
export interface TradeoffMatrixBlock extends VisualBlockBase {
  kind: "tradeoffMatrix";
  optionIds: SemanticNodeId[]; dimensionIds: SemanticNodeId[]; cells: TradeoffCell[];
}
export interface RiskMapBlock extends VisualBlockBase {
  kind: "riskMap";
  riskIds: SemanticNodeId[]; assumptionIds: SemanticNodeId[];
}
export interface TimelineBlock       extends VisualBlockBase { kind: "timeline";       actionIds: SemanticNodeId[]; }  // pre-ordered
export interface ActionChecklistBlock extends VisualBlockBase { kind: "actionChecklist"; actionIds: SemanticNodeId[]; }
export interface OpenQuestionsBlock   extends VisualBlockBase { kind: "openQuestions";  questionIds: SemanticNodeId[]; }

export type VisualBlock =
  | DecisionBriefBlock | MindMapBlock | ArgumentMapBlock | TradeoffMatrixBlock
  | RiskMapBlock | TimelineBlock | ActionChecklistBlock | OpenQuestionsBlock;

export interface VisualPlan {
  schemaVersion: 1;
  artifactId: string;
  blocks: VisualBlock[];      // canonical order, weak blocks omitted (§4)
}
```

### 3.3 Extended `PipelineResult` — edit `app/src/pipeline.ts`

```ts
import type { SemanticArtifact, AgentBrief } from "./semantic/types.js";
import type { VisualPlan } from "./visual/types.js";

export interface PipelineResult extends ConversionResult {
  ir: TipTapDoc;
  elapsedMs: number;
  /** New — all OPTIONAL so the legacy HTML path (no extraction) still type-checks and runs. */
  semanticArtifact?: SemanticArtifact;
  visualPlan?: VisualPlan;
  agentBrief?: AgentBrief;   // Phase 8; stays undefined in Phases 0–6
}
```

`runPipeline` keeps producing HTML for legacy. **ARCH DECISION:** semantic extraction is invoked
**separately** (not inline in `runPipeline`) via a new `runSemanticPipeline(ir)` in `extract.ts` that
returns `{ semanticArtifact, visualPlan }`, so conversion and extraction fail independently and the mock
path is trivially swappable. The convert API route (Phase 6) calls both and merges into `PipelineResult`.

---

## 4. Deterministic planner rules — `app/src/visual/plan.ts`

`planVisuals(artifact)` is PURE and total (never throws; returns `{blocks:[]}` in the degenerate case).
Emit blocks in this **fixed canonical order**, each only if its threshold passes. **Omit weak blocks;
never pad, never invent nodes.** All `nodeIds` must reference existing artifact nodes (enforced by
`validateVisualPlan`).

| # | Block | Emit condition | Notes |
|---|---|---|---|
| 1 | `decisionBrief` | `primaryDecisionId` set with non-empty `question`, **else** `thesis` non-empty | Always present if the artifact is non-trivial — anchors the first viewport. Degrades to thesis-only brief if no decision. |
| 2 | `mindMap` | `nodes.length ≥ 5` AND total relationship edges `≥ 3` | Omit for essentially-linear memos. `rootId` = primaryDecision or a synthesized center (use decision/thesis node). |
| 3 | `argumentMap` | `claims ≥ 2` AND (`evidence ≥ 1` OR any `supports`/`contradicts` edge exists) | Edges from claim relationships only. |
| 4 | `tradeoffMatrix` | `options ≥ 2` AND `tradeoff(dimension) ≥ 1` | Cells filled from option×dimension where stated; empty cell → `value:"—"`. Never fabricate a value. |
| 5 | `riskMap` | `risks ≥ 2` OR (`risks ≥ 1` AND `assumptions ≥ 1`) | v1 = likelihood×impact grid (see C2). |
| 6 | `timeline` | `≥ 2` actions carry a `due` or `order` | Order by `order` then `due`; ties keep extraction order. |
| 7 | `actionChecklist` | `actions ≥ 1` | Always if any action exists (even if timeline also emitted). |
| 8 | `openQuestions` | `questions ≥ 1` | — |

Block ids are `vb_<kind>` (one block per kind in v1). `title` is a fixed human string per kind
("Decision Brief", "Mind Map", "Argument Map", "Tradeoff Matrix", "Risk Map", "Timeline",
"Action Checklist", "Open Questions").

---

## 5. Extraction contract — `extract.ts` / `schema.ts` / `sourceTrace.ts` / `mock.ts` / `rubric.ts`

### 5.1 LLM output JSON (the ONLY thing the model returns)

Add role `"extract"` to `app/src/convert/client.ts` (`Role` union + `DEFAULTS` convert-tier model +
`ROLE_ENV_KEY.extract = "EXTRACT_MODEL"` + `ROLE_FALLBACK_ENV_KEY.extract = "EXTRACT_MODEL_FALLBACKS"`).
This is a small, allowed edit to the shared client; rebuild after.

The prompt (built from `nodeToPlainText(ir)` — reuse `tipTapDocToPromptText` from convert) instructs the
model to return **only** a JSON object of this shape (no prose, no fences; `extract.ts` strips fences
defensively like `stripFences`):

```jsonc
{
  "title": "…", "bluf": "…", "thesis": "…",
  "primaryDecision": { "title": "…", "summary": "…", "question": "…",
                       "recommendedOption": "…?", "sourceQuotes": ["verbatim…"] },
  "nodes": [
    { "kind": "risk", "title": "…", "summary": "…", "sourceStatus": "explicit",
      "sourceQuotes": ["verbatim span copied from the source"],
      "likelihood": "high", "impact": "medium",
      "relationships": { "blocks": ["<title-or-index ref>"] } }
    // …one per decision/claim/evidence/assumption/risk/option/tradeoff/action/question/stakeholder
  ]
}
```

`extract.ts` post-processes the raw model JSON into a `SemanticArtifact`: assigns stable ids
(`<kind>_<n>`), resolves relationship references (model refers to nodes by title or 1-based index; map to
ids), converts `sourceQuotes` → `SourceRef[]`, then calls `resolveSourceRefs(artifact, ir)` (sourceTrace)
to fill `charStart/charEnd`, then `validateSemanticArtifact(artifact)` — throwing on any error.

**Required `sourceRefs` per node:** every node needs ≥1 `sourceRef` UNLESS `sourceStatus ===
"missing_evidence"` (used for explicitly-flagged ungrounded assumptions). Decision nodes ALWAYS need ≥1.

### 5.2 sourceTrace design — `sourceTrace.ts`

- `resolveSourceRefs(artifact, ir): SemanticArtifact` — for each `SourceRef.quote`, locate it in
  `nodeToPlainText(ir)` (normalize whitespace as `comments.ts` `cleanText` does) and set `charStart/End`.
  Exact match first; if not found, leave char fields undefined and mark the ref (do not throw here).
- `validateSourceTrace(artifact, ir): { valid, errors[] }` — separate, called by tests/CI: a ref whose
  `quote` does not appear in the source is an error (this is the deterministic anti-fabrication guard,
  distinct from the LLM eval). `blockPath` if present must index a real block.
- **ARCH DECISION:** char offsets are into the whitespace-normalized plain text, mirroring the existing
  comment-anchor model, so Phase 7 can reuse `locate()` machinery for source-text fallback anchors.

### 5.3 `validateSemanticArtifact(artifact)` — `schema.ts` (hand-rolled, no zod)

Returns `{ valid: boolean; errors: string[] }`. Rules (each a distinct error string; SEM-005 tests one
fixture per rule):
1. Duplicate node ids → error.
2. Any node with empty `sourceRefs` AND `sourceStatus !== "missing_evidence"` → error.
3. Any relationship id not present in `nodes` (dangling) → error.
4. Any `kind` outside the 10-kind union → error.
5. `primaryDecisionId` set but no matching decision node → error.
6. Decision node with empty `question` or empty `summary` → error ("missing decision summary").
7. `schemaVersion !== 1` → error.

### 5.4 Mock extraction — `mock.ts` (deterministic, key-free)

`mockExtract(ir): SemanticArtifact`:
1. **Fixture map first:** keyed by `ir.sourceFile` (and/or a content hash) → the matching golden
   `*.artifact.json`. Used by tests and by the web convert route when `MOCK_AI==="true"` /
   `PLAYWRIGHT_TEST==="true"` (same env switch the convert route already uses).
2. **Heuristic fallback:** for any unknown input, a pure structural extractor — first heading/paragraph →
   thesis+bluf+primaryDecision; subsequent headings → claims; bullet lists under an "actions"/"next
   steps" heading → actions; etc. It must **always** return a schema-valid artifact and **never throw**.
   Quotes are copied verbatim from the IR so sourceTrace resolves. This guarantees offline determinism.

### 5.5 Eval rubric — `rubric.ts` (EVAL ONLY, real keys, on demand — NOT in CI unit run)

Mirror `convert/rubric.ts` shape (`RUBRIC_VERSION`, `CRITERIA[]`, `THRESHOLDS`). Six dimensions from the
plan: (a) main decision identified; (b) no invented facts (zero-tolerance); (c) material risks captured;
(d) assumptions separated from evidence; (e) options/tradeoffs captured; (f) actions preserved. Judge is
LLM-as-judge; regression additions come from real failures. Never assert exact string equality on model
output.

Also add a debug CLI (`app/scripts/extract.ts`, invoked `tsx`) that prints extracted semantic JSON for a
given doc — mirrors the existing `scripts/convert.ts` pattern.

---

## 6. Visual component contracts — `web/src/components/visual/*`

Shared contract for all 8:
- **Props = semantic data in, nothing fetched inside.** Each takes its `VisualBlock` + the node lookup
  (a `Map<SemanticNodeId, SemanticNode>` or the `SemanticArtifact`). No network, no context reads for
  data (context is only the wiring convenience in NodeViews — pass data as props to the leaf component so
  it is unit/preview-testable in isolation).
- **`data-semantic-node-id`** on the DOM element representing each node (required — Phase 7 hover-links
  comment cards to visual nodes by querying this attribute). Block root carries `data-visual-block-id`.
- **Styling:** light/executive only. Use the scoped tokens from `web/src/app/decision-room.css`
  (see C1) — surfaces `#ffffff`/`#f8fafc`, ink `#0f172a`/`#334155`, hairline borders `#e2e8f0`, one
  restrained accent. Reuse existing `.vcd-*` class vocabulary where it already fits (`web/src/app/
  globals.css` `.vcd-bluf`, `.vcd-table`, `.badge`) but **override** its indigo/gradient/glow with the
  calm accent. NO `backdrop-filter`, NO gradient headers, NO glow shadows, NO dark surfaces.
- **Empty/degenerate:** each renders a quiet empty state if handed zero nodes (should not happen —
  planner omits the block — but be defensive).

Per-component prop sketch (all `React.FC` with explicit props interfaces):

| Component | Props (beyond `nodes` lookup) | Rendering |
|---|---|---|
| `DecisionBrief` | `block: DecisionBriefBlock`, `decision?`, `bluf`, `status` | BLUF card + the decision question + recommended option + key risks/actions chips. This is the "Brief" tab hero. |
| `MindMapView` | `block: MindMapBlock` | `@xyflow/react` — controlled, `fitView`, `nodesDraggable={false}`, `nodesConnectable={false}`, `panOnDrag` ok, no editing. Nodes are simple labeled cards; edges labeled by relation. |
| `ArgumentMapView` | `block: ArgumentMapBlock` | `@xyflow/react` — claims as nodes, `supports` (solid) vs `contradicts` (dashed/red) edges. Same read-only config. |
| `TradeoffMatrix` | `block: TradeoffMatrixBlock` | Plain HTML `<table>` (`.vcd-table`), options as rows, dimensions as columns, `sentiment` → subtle text color, not fill. |
| `RiskMap` | `block: RiskMapBlock` | **v1: likelihood×impact 3×3 grid** (see C2). Each risk placed by `likelihood/impact`; unknowns go to a "unscored" strip. No xyflow. |
| `TimelineView` | `block: TimelineBlock` | Vertical ordered list with `due`/`owner`; reuse `.vcd-node`-style spine but light. |
| `ActionChecklist` | `block: ActionChecklistBlock` | Checklist rows (owner, due, done). Read-only checkboxes in v1. |
| `OpenQuestions` | `block: OpenQuestionsBlock` | Simple list of questions with source chips. |

**xyflow usage pattern (MindMapView, ArgumentMapView):** wrap in `<ReactFlowProvider>`, controlled
`nodes`/`edges` derived from the block via `useMemo`, `fitView` + `fitViewOptions={{ padding: 0.2 }}`,
`proOptions={{ hideAttribution: true }}` only if licensed else leave default, all interaction editing
OFF. **SSR:** xyflow touches `window`; the editor + these views are client components (`"use client"`),
and MindMap/ArgumentMap are imported via `next/dynamic` with `{ ssr: false }` from the tab container
(see C4). Import `@xyflow/react/dist/style.css` once (in the editor or layout).

Fixture preview route `web/src/app/preview/visual/page.tsx` renders each component against
`founder-memo.artifact.json` + its plan (call `planVisuals` client-side) for visual QA (VISUI-010).

---

## 7. TipTap projection & decision-room layout

### 7.1 Projection — `app/src/visual/project.ts` (pure) + `web/src/components/tiptap/*`

- `projectArtifact(artifact, plan): TipTapVisualDoc` returns plain ProseMirror JSON:
  `{ type: "doc", content: [ <one custom block node per VisualBlock, in plan order> ] }`.
- **ARCH DECISION — attrs hold IDs only.** Each custom node:
  `{ type: <name>, attrs: { blockId, blockKind, primaryNodeId } }`, `content` empty. The NodeView reads
  full block + node data from `SemanticArtifactContext` by `blockId`. This keeps the PM doc tiny, makes
  serialization round-trip trivially lossless (attrs are plain JSON), and decouples the durable doc from
  visual detail. `VISUAL_TIPTAP_NODE_NAMES` (exported from `project.ts`) is the single source of node
  names, imported by both `project.ts` and `web/.../nodes.ts` so they cannot drift.
- Node name map (plan Phase 4.4): `decisionBrief→decisionBriefBlock`, `mindMap→mindMapBlock`,
  `argumentMap→argumentMapBlock`, `tradeoffMatrix→tradeoffMatrixBlock`, `riskMap→riskMapBlock`,
  `timeline→timelineBlock`, `actionChecklist→actionChecklistBlock`, plus `sourceExcerptBlock` (holds a
  `SemanticNodeId` + `SourceRef` index for the Source tab). `openQuestions` renders inline in the brief/
  actions region in v1 (no dedicated TipTap node needed) — **ARCH DECISION** to keep node count at the 8
  the plan named.
- Custom nodes are `Node.create({ name, group:"block", atom:true, selectable:false, draggable:false,
  parseHTML/renderHTML → a div with data-* attrs, addNodeView → ReactNodeViewRenderer(<Component/>) })`.
- **Read-only enforcement:** `useEditor({ editable: false, ... })`; also `editorProps.attributes` sets
  `contenteditable=false`. Starter-kit configured minimally (the doc is atoms; no rich-text editing in
  v1). Do not register table/link extensions for the projected doc unless a block needs them.
- **Round-trip test (TIP-005, vitest in app):** `projectArtifact(a, p)` → assert it is valid PM-shaped
  JSON, one node per plan block, node names ∈ `VISUAL_TIPTAP_NODE_NAMES`, and `attrs` re-serialize
  identically (deep-equal `JSON.parse(JSON.stringify(doc)) === doc`). A thin web test may additionally
  mount the editor and assert `editor.getJSON()` deep-equals the input.

### 7.2 Decision-room layout — decompose `web/src/app/page.tsx`

Current `page.tsx` is a single 2,303-line `Home()` with ~50 `useState`. Target tree:

```
app/page.tsx                         // thin: session gate → <AuthScreen/> or <DecisionRoomApp/>
DecisionRoomApp.tsx                  // owns workspace/doc/version/comment DATA + polling (moved out of page.tsx)
  DecisionRoomLayout.tsx             // 3-pane shell (light root; imports decision-room.css)
    TopDecisionBar.tsx               // room title · BLUF · DecisionStatus (replaces "Alignment Sign-off Verdicts")
    WorkspaceNav.tsx                 // collapsible left: workspace + document list (reuse WorkspaceSelector)
    VisualTabs.tsx                   // Brief | Map | Tradeoffs | Risks | Actions | Source
      → SemanticArtifactEditor.tsx   // center canvas when doc has semanticArtifact
      → DocumentSurface.tsx (legacy) // center canvas when it does NOT (parity fallback)
    ReviewRail.tsx                   // right: reuse CommentSidebar as-is in this run (Phase 7 redesigns)
    EmptyState.tsx                   // "Import your first strategy memo" when workspace has 0 docs
```

**State ownership:** all data/effects (documents, workspaces, versions, comments, verdicts, polling,
convert modal) move from `page.tsx` into `DecisionRoomApp` (or a `useDecisionRoomState` hook). Layout
components are **presentational** — props in, callbacks out. Do this incrementally (ROOM-001 extracts the
shell first; behavior must stay identical — the diff is decomposition, not redesign).

**Tab → block mapping:** Brief=`decisionBrief`(+openQuestions inline); Map=`mindMap`+`argumentMap`;
Tradeoffs=`tradeoffMatrix`; Risks=`riskMap`; Actions=`timeline`+`actionChecklist`; Source=source
excerpts / raw IR text / legacy HTML. Tabs whose block was omitted by the planner render disabled/hidden.

**Reused vs replaced:** REUSE `AuthScreen`, `Header`, `WorkspaceSelector`, `WorkspaceSettingsModal`,
`CommentSidebar`, `DocumentSurface`, `SurgicalEditSandbox`. REPLACE the inline three-pane JSX and the
verdict UI (→ `DecisionStatus`). REMOVE seeded reviewer names for **new** documents (ROOM-005): stop
seeding `SEED_COMMENTS`/`verdicts` in `web/src/app/api/collab/route.ts` `INITIAL_STATE` for freshly
created docs — legacy demo docs keep their seeds; new docs start empty. Preserve account-required
onboarding; invited viewers route straight to the room after signup.

**Legacy remains reachable:** router picks by data — `state.semanticArtifact` present → decision room;
absent → legacy `DocumentSurface`. Both keep working; no legacy deletion this run.

---

## 8. Build order & review checklists

App tasks and web tasks are **disjoint** and parallelizable after their gate. `‖` = may run in parallel.

**Wave A — app foundation (no web dep).**
- SEM-001 `types.ts` → SEM-002 `schema.ts` ‖ SEM-003 `sourceTrace.ts` (both depend only on types).
- SEM-004 fixtures (memo + goldens) → SEM-005 validator tests (needs schema + fixtures).
- SEM-006 `extract.ts` prompt/builder ‖ SEM-007 `mock.ts` (mock unblocks everything downstream offline).
- SEM-008 rubric (eval-only).
- VIS-001 `visual/types.ts` → VIS-002 `plan.ts` → VIS-003 `validate.ts` (depend on semantic types).
- `project.ts` (+ `VISUAL_TIPTAP_NODE_NAMES`) after VIS-002.
- Extend `PipelineResult` (pipeline.ts) after semantic + visual types exist.
- **Gate A:** `cd app && npm run build` green; full vitest suite passes offline (mock path only).

**Wave B — web (starts only after Gate A + `app/dist` rebuilt).**
- TIP-001 install deps + **compat smoke test FIRST** (see §12) before any TipTap code.
- TIP-002 read-only editor shell + context ‖ VISUI-001..007 components (components don't need the editor;
  build against fixtures via the preview route).
- TIP-003/004 custom nodes + NodeViews (need components + `project.ts`).
- TIP-005 serialization tests.
- ROOM-001 extract shell → ROOM-002 layout → ROOM-003 tabs → ROOM-004 empty state → ROOM-005 unseed.
- **Gate B:** `web` builds (`npm run build`), preview route renders all 8 components light/calm, decision
  room renders the founder-memo fixture end-to-end, legacy doc still opens.

**Reviewer checklist (I enforce these later):**
- app-side: no React/DOM globals in `app/src`; new file in `exports`; `.js` import extensions; vitest
  added and offline; validators return `{valid,errors[]}`; ids stable & deterministic; planner omits
  (never pads) weak blocks and never invents nodeIds; sourceTrace rejects unquoted refs.
- web-side: components take data as props (no fetching); `data-semantic-node-id` present on every node;
  no dark/glass/gradient/glow (grep for `backdrop-filter`, `linear-gradient`, `rgba(79, 70, 229` in new
  files); xyflow views client-only + editing disabled; TipTap `editable:false`; projection attrs are
  ids-only; legacy path untouched; new docs unseeded.
- every app change ends with `npm run build`; every web task that consumed changed app code confirms it
  rebuilt dist first.

---

## 9. Risk register (top 5)

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | TipTap v3 / React 19.2 / Next 16 (`--webpack`) incompatibility or NodeView render bugs | Med | TIP-001 smoke test is a **hard gate** before any TipTap code (§12). Pin exact versions. Read `web/node_modules/next/dist/docs/` first (repo's `web/AGENTS.md`: "this is NOT the Next.js you know"). |
| R2 | `app/dist` staleness silently breaks web at import time (happened before, 2026-06-12) | High | Build rule in §0.2; every app task DoD + reviewer checklist enforces `npm run build`; web tasks re-verify dist. `web` `prebuild` already runs the app build for prod. |
| R3 | Projection drift — TipTap node attrs diverge from semantic/visual types | Med | Attrs are ids-only; `VISUAL_TIPTAP_NODE_NAMES` is the single shared name source; round-trip test (TIP-005); NodeViews read from context by id (no duplicated data). |
| R4 | xyflow SSR crash in Next server render (`window` access) | Med | MindMap/ArgumentMap imported via `next/dynamic {ssr:false}`; whole editor is a client component; import xyflow CSS once. RiskMap avoids xyflow entirely (C2). |
| R5 | `page.tsx` decomposition regresses collab behavior (polling, auth, comment lifecycle) | High | ROOM-001 is a pure move (behavior-identical) reviewed against current behavior before ROOM-002 redesign; keep `CommentSidebar`/`DocumentSurface` untouched; verify login persistence, `<details>` persistence, comment create/resolve still work (the smoke set from the project handoff). |

---

## 10. Vocabulary (Phase 0, DOC tasks — for consistent naming across code + UI)

Strategy Doc (input) · Decision Room (the artifact surface) · Visual Brief (the rendered set) · Review
(comments + decision status) · Agent Brief (Phase 8). UI copy: "Decision status" (not "Alignment
Sign-off Verdicts"); empty state "Import your first strategy memo". These are the strings builders use.

---

## 11. Contradictions found in the codebase vs the plan — with resolutions

- **C1 — Dark/glass styling vs the light "executive cognition" tenet.** `web/src/app/globals.css` sets
  `body { background:#1e293b (slate-800) }`, `.glass-panel` (`backdrop-filter: blur`), indigo/purple
  gradients, glow shadows, and `.vcd-bluf`/`.vcd-node` use gradient + glow. This directly violates the
  plan's "light surface, minimal decoration, no dark/glass dashboard feel."
  **Resolution:** do NOT flip the global body (legacy chrome + `DocumentSurface` depend on it). Introduce
  a **scoped light token layer** `web/src/app/decision-room.css` applied at `DecisionRoomLayout`'s root
  (`.decision-room-root { background:#f8fafc; color:#0f172a; }`) and author all new visual/room CSS with
  those tokens, overriding the inherited indigo/gradient/glow. New components must not use
  `backdrop-filter`, gradients, or glow. Full global re-theme is deferred to launch polish (Phase 10).
- **C2 — "risk/dependency map" implies xyflow, but a graph reads busy and most memos lack an explicit
  dependency graph.** Core-architecture text says xyflow renders "mind map, argument map, risk/dependency
  map"; the tenet says structure over decoration.
  **Resolution (ARCH DECISION):** RiskMap v1 = a calm **likelihood×impact matrix grid** (no xyflow).
  This is more legible for executives and shrinks xyflow's blast radius (R4). Dependency edges
  (`blocks`/`dependsOn`) are deferred to a later graph view. xyflow is used by MindMap + ArgumentMap only
  in v1.
- **C3 — ADR names Claude 3.5 Sonnet / Claude 3 Haiku / Prisma/Drizzle; the live code uses newer models
  and raw `pg`.** `app/src/convert/client.ts` defaults to `claude-sonnet-4-6`/`claude-haiku-4-5`;
  storage is raw `pg` with a `collab_state(key, value JSONB)` table, not an ORM. The ADR is aspirational
  Phase-1 text.
  **Resolution:** follow the **code**, not the ADR prose. Extraction reuses the existing `client.ts`
  provider abstraction (new `extract` role, convert-tier model). Persistence stays the current `pg` JSONB
  blob for Phases 0–6 (semantic artifact + plan are stored inside the existing per-document state blob —
  Phase 9 migrates to tables, OUT of scope). Phase 0's DOC-002 should update the ADR to match; that is a
  docs edit, not a code change.
- **C4 — `web` has no JS unit-test runner** (only Playwright); the plan asks for serialization tests
  (TIP-005) and validator tests.
  **Resolution:** put all deterministic unit tests in the **app** vitest suite. This is why `project.ts`
  (pure JSON projection) lives in `app` (§2) rather than web — TIP-005 runs there, key-free. Web keeps
  only Playwright/browser tests. Do not add a second test runner to web in this run.

---

## 12. Dependency versions (TIP-001) — pin these exactly

Verified against the registry; all satisfy React 19.2 / react-dom 19.2 peer ranges (`^19` accepted) and
work under Next 16 webpack mode.

```jsonc
// web/package.json dependencies — ADD:
"@tiptap/react":            "3.27.3",
"@tiptap/starter-kit":      "3.27.3",
"@tiptap/pm":               "3.27.3",   // ProseMirror bundle — REQUIRED peer of @tiptap/react
"@tiptap/extension-table":  "3.27.3",   // adopt per plan; keep even if unused by projected doc
"@tiptap/extension-link":   "3.27.3",
"@xyflow/react":            "12.11.2"
```

Notes / known friction:
- **`@tiptap/pm` must be installed explicitly** — it is a peer of `@tiptap/react@3.27.3` (peer set:
  `@tiptap/core`, `@tiptap/pm` both `3.27.3`). Keep all `@tiptap/*` on the **same exact version**;
  mismatched TipTap versions throw at runtime.
- TipTap 3 peer range is `react ^17||^18||^19` — 19.2 is in range. `@xyflow/react` 12.11.2 peer is
  `react >=17` — fine. Neither needs an override.
- **TIP-001 smoke test (do this before writing any TipTap feature code):** add the deps, then render a
  trivial read-only `useEditor({ editable:false, extensions:[StarterKit], content:"<p>ok</p>" })` in one
  client component and a bare `<ReactFlow nodes={[]} edges={[]}/>` behind `next/dynamic {ssr:false}`, run
  `npm run dev --webpack` **and** `npm run build`, and confirm no hydration error, no `window is not
  defined`, and the React Compiler (`reactCompiler:true` in `next.config.ts`) does not choke on TipTap's
  hooks. If the React Compiler conflicts with TipTap/xyflow, the escape hatch is a per-file
  `"use no memo"` directive or narrowing `reactCompiler` — decide then, document it. Only proceed if this
  gate is green.
- Read `web/node_modules/next/dist/docs/` before writing Next-touching code (repo mandate in
  `web/AGENTS.md` — this Next build has breaking changes vs. training data).
```
