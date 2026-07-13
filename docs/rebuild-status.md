# Decision-Rooms Rebuild — Status & Handoff Checklist

Last updated: **2026-07-12** · Branch: **`rebuild/decision-rooms`** (do NOT push — pushing `main` deploys via Vercel; the owner also declined branch pushes) · This file is the **canonical, provider-agnostic resume point**: any agent/LLM session continuing the rebuild starts by reading this file, then the two governing docs below.

## Governing docs (read in this order)
1. `docs/rebuild-architecture.md` — **BINDING** architecture brief (Phases 0–6). Type contracts are copied verbatim into code; §4 planner rules, §5 extraction contract, §7 projection/layout, §8 build order + review checklists, §12 pinned dependency versions.
2. `docs/visual-decision-room-plan.md` — product/phase plan (Phases 0–10) + granular task queue.
3. `htmlcollab-prd-and-plan.md` — tenets §6, anti-scope §7, decision log Part 4 (the "why"). Its 2026-07-12 addendum delegates rebuild implementation to docs 1–2.

## Owner decisions in force (2026-07-12)
- Scope of the current run was Phases 0–6 with a **user UX checkpoint after Phase 6**; the session-limit cut reduced this run to **Phases 0–3 (done)**. Phases 4–6 are next; the UX checkpoint before Phase 7+ still stands.
- Builder/reviewer split: Sonnet-class model builds; Opus-class architect wrote the brief and reviews each phase's diff. (Provider-agnostic equivalent: any strong model may review, but review against `rebuild-architecture.md` §8 checklists.)
- Real-LLM validation at phase gates; deterministic mocks everywhere in CI.
- Commit per reviewed task group on this branch. Never push.

## State checklist

### Done ✅ (verify with the commands at the bottom)
- ✅ **Phase 0 — docs reset** (`6a20381`): PRD pivot addendum + persona flip, ADR → Accepted with live-code addendum, flagship acceptance test §15A, vocabulary. (CLAUDE.md/AGENTS.md are local-only files, updated outside git.)
- ✅ **Architecture brief** (`8c4ad6a`): `docs/rebuild-architecture.md`, 4 contradictions resolved (C1 scoped light theme; C2 RiskMap = grid, not xyflow; C3 follow code not ADR prose; C4 all unit tests in app vitest).
- ✅ **Phase 1 — semantic model** (`b5486eb`): `app/src/semantic/{types,schema,sourceTrace,index}.ts`, founder-memo + dentaltechhub fixtures/goldens, 28 tests.
- ✅ **Ingest fixes** (`d91988c`): HTML entities decoded; `<li>` mixed-children duplication fixed (`- **Label**: rest` pattern). 7 regression tests. These were prerequisites for verbatim-quote matching.
- ✅ **Phase 2 — extraction** (`0c78647`): `extract.ts` (LLM prompt `extract-v1`, id assignment, relationship resolution, quote→SourceRef), `mock.ts` (fixture registry + total heuristic fallback), `rubric.ts` (6 dimensions, `b_no_invented_facts` zero-tolerance), `extract` role in `convert/client.ts` (`EXTRACT_MODEL` env), debug CLI `npm run extract -- <doc> [--mock]`.
  **Real-LLM gate PASSED**: founder memo → 26 nodes / all 10 kinds, schema valid, **34/34 quotes verbatim-resolved**, judge **6/6 criteria** incl. zero-tolerance (model: claude-sonnet-4-6).
- ✅ **Phase 3 — visual planning** (`0024d20`): `app/src/visual/{types,plan,validate,project,index}.ts`. Planner emits all 8 blocks for rich artifacts (golden AND real-LLM output), 3 for sparse dentaltechhub (weak blocks omitted, never padded). `runSemanticPipeline(ir)` → `{semanticArtifact, visualPlan}`. `VISUAL_TIPTAP_NODE_NAMES` in `project.ts` is the single source of TipTap node names.
- Suite: **297/297 vitest green, offline** (`cd app && npx vitest run`); typecheck + build green.

- ✅ **Opus review of Phases 1–3 (2026-07-12): verdict "safe for Phase 4", 0 blockers.** All 7 SHOULD-FIX findings applied same-session: NUL byte in `extract.ts` (file was binary to git — restored diffability); primary decision now referenceable in relationships (was systematically dropped → edge-less mind-map roots; fixed + prompt v2 + verified on a real extraction); tradeoff `cellValue` checks both relationship directions; schema rules 8 (missing node id) + 9 (`sourceStatus` enum); golden fixtures' evidence→claim edges corrected to `supports`; `normalizeWhitespace`↔`cleanText` parity test. Also applied 2 nits: `registerMockFixture` validates goldens, `mockExtract` clones registry returns. **305/305 tests.**
  Deferred NITs (do in a later pass): non-string relationship refs silently skipped by validator; dropped-refs only `console.warn`'d (consider `SemanticPipelineResult.warnings`); timeline `due` sort is lexicographic across mixed ISO/phrases; `blockPath` validation accepts text-leaf terminals.
  **Known LLM variance mode** (for the eval golden set): a second real extraction run stitched some quotes with "..."/paraphrase — `validateSourceTrace` caught all 5 deterministically (artifact stayed valid; refs stay un-anchored). Prompt v2 now forbids stitching. Add such runs to the eval regression set when the harness lands.

- ✅ **Phase 4 — TipTap canvas** (`601c98d`, built by Opus, orchestrator-verified in-browser): TIP-001 compat gate PASSED (pinned `@tiptap/*@3.27.3` + explicit `@tiptap/pm`, `@xyflow/react@12.11.2`; Next 16 webpack build + dev clean under React Compiler — no escape hatch needed; `"use no memo"` on the `useEditor` host as documented TipTap-recommended future-proofing). `web/src/components/tiptap/`: read-only `SemanticArtifactEditor` (consumes compiled `projectArtifact`; StarterKit atoms-only with **`trailingNode:false`** — required or round-trip breaks), 8 atom nodes named from `VISUAL_TIPTAP_NODE_NAMES`, shared `VisualBlockNodeView` with per-kind placeholder cards (light executive styling, `data-semantic-node-id` everywhere), `SemanticArtifactContext` + `useSemanticBlock(blockId)`. Dev preview **`/preview/canvas`** (founder golden via dev-only fs read; round-trip probe renders PASS in-page); `/preview/compat` is the preserved gate. Verified: 8 blocks in plan order, 22 unique node ids, zero console errors, legacy surface unaffected, 305/305 app tests, web tsc clean.
  **Phase 5 swap point:** replace entries in the `PLACEHOLDER_BODIES` map (`VisualBlockNodeView.tsx`) one kind at a time with real `web/src/components/visual/*` components; NodeView keeps card chrome + id resolution and passes `block` + node lookups down as PROPS (leaf components stay context-free per brief §6). xyflow CSS already imported once in the editor; graph views must be `next/dynamic {ssr:false}`.

### Not done ⬜ (next session picks up here — OWNER GATE: do not start Phase 5 until the owner says go)
- ⬜ **Phase 5 — visual components** (VISUI-001..007; brief §6): 8 components under `web/src/components/visual/`, `data-semantic-node-id` on every node element, scoped light theme `web/src/app/decision-room.css` (do NOT flip the global dark body — brief C1), RiskMap is a likelihood×impact grid (no xyflow), MindMap/ArgumentMap via `next/dynamic {ssr:false}`, fixture preview route `web/src/app/preview/visual/page.tsx`.
- ⬜ **Phase 6 — decision room UI** (ROOM-001..005; brief §7.2): decompose `web/src/app/page.tsx` (2,303 lines) per the component tree in §7.2 — ROOM-001 is a **pure behavior-identical move first**; router picks by data (`semanticArtifact` present → decision room, absent → legacy `DocumentSurface`); "Decision status" replaces "Alignment Sign-off Verdicts"; new docs unseeded; empty state "Import your first strategy memo".
- ⬜ **Phase 6 gate + UX checkpoint**: full suite, `web` build, real memo import → decision room in a browser, legacy doc still opens, desktop+mobile screenshots → **STOP and show the owner before Phase 7+**.
- ⬜ Phases 7–10 (per plan). Note for planning: the plan's task queue has no IDs for Phases 9–10 — extend with `PERS-00x`/`LOOP-00x` when you get there. E2E-001..004 remain unstarted.
- ⬜ Web convert route wiring: `runSemanticPipeline` exists but `web/src/app/api/collab/convert/route.ts` does not call it yet, and the persisted per-doc state blob does not yet store `semanticArtifact`/`visualPlan`. This is Phase 4/6 wiring work (the route should use mock mode under `MOCK_AI`/`PLAYWRIGHT_TEST`). **Reviewer note:** the package `exports` map does NOT expose `app/tests/fixtures/*`, so web cannot import the goldens to `registerMockFixture` them — either add an exports entry for the goldens or accept that web mock mode uses the heuristic extractor (deterministic + valid). Decide explicitly at Phase 4 wiring, don't discover it.

## Invariants (enforced at every step)
1. **`cd app && npm run build` after ANY `app/src` change, before any `web` work/test** — `web` imports compiled `app/dist`; stale dist breaks web at import time.
2. LLM emits semantic JSON only — never HTML, never TipTap. Planning/projection are pure deterministic code.
3. Deterministic vitest (offline, key-free) for all non-LLM behavior; LLM quality = eval rubric with real keys, never exact-string unit tests.
4. Legacy `DocumentSurface` path keeps working until TipTap parity; new UI is additive.
5. No dark/glass styling in new decision-room UI (light executive tokens, scoped).
6. Supersede docs with dated entries; never rewrite history.

## Verify current state (run from repo root)
```bash
cd app && npm run typecheck && npm run build && npx vitest run   # expect 297 passing
npm run extract -- tests/fixtures/founder-strategy-memo.md --mock # offline pipeline smoke
git log --oneline -8                                              # commits listed above
```
Real-LLM spot check (needs `app/.env` keys): `npm run extract -- tests/fixtures/founder-strategy-memo.md`
