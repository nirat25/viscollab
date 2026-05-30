# HTMLCollab — Project Instructions for Claude Code

## What this is
A **complementary** review-and-alignment layer downstream of where teams draft (Word, Google Docs). Author pushes a refined sign-off draft → platform converts it into a structured, interactive HTML artifact built for fast comprehension → cross-functional team reviews, comments, aligns. **Does NOT replace the drafting tool.**

## Source-of-truth hierarchy (read before any work)
1. **`htmlcollab-prd-and-plan.md` (v1.0) — AUTHORITATIVE.** Strategy, MVP definition, phased execution plan, decision log. All task IDs, gates, and tests live here.
2. **`htmlcollab-spec.md` (v0.3) — SUPERSEDED context only.** Pre-ideation. The PRD explicitly **overrides** it. Do NOT implement spec ideas the PRD cut.

When PRD and spec conflict, PRD wins. The spec's `§6A` and `§7` reasoning is preserved (correctly) in the PRD's Part 4 decision log.

## CURRENT STATUS — handoff (last updated 2026-05-30)
*Read this to pick up the work. Two spikes exist; collaboration is the active focus (see plan-mod #3).*

### `spike-collab/` — collaboration layer (ACTIVE, the differentiator) — `index.html`, self-contained, no key
Run: `python -m http.server 8123 --directory spike-collab` → open `http://localhost:8123/index.html` (needs CSS Custom Highlight API — recent Chrome/Edge/Firefox). Verify via the `window.__spike` debug handle (functional eval; screenshot was flaky).
**Built + verified (PRD P2-T4 essentially complete at spike fidelity):**
- Two anchor types: **text** (text-quote: quote+prefix/suffix) and **element** (devtools-style picker; anchor by id→path→hash — more durable than text). One unified model.
- Re-anchor chain: exact → context-bracket → **fuzzy** (Dice bigrams, `FUZZY_THRESHOLD=0.6`) → orphan. Two axes: lifecycle (open/resolved) × anchorStatus (anchored/stale/orphaned), never conflated.
- Lifecycle: resolve/reopen, per-comment **history**, filter tabs, **manual re-attach**, **"Addressed (content edited)"** before/after change-link (no incumbent has this).
- **Threads** (replies) + **@mentions** (autocomplete, parsed/highlighted) + **notification record** + per-user 🔔 bell.
- **Reader sign-off verdict** (Approve / Request changes / Block) — the alignment north-star signal.
- Mock identity: Reader=Alex, Author=Nirat. Decisions/rationale: `docs/comment-lifecycle-research.md`.

### `spike/` — conversion-fidelity (PARKED, plan-mod #3) — Node/TS
Conversion doc→IR→HTML + eval harness (doc-agnostic). Deterministic parts verified; LLM eval (`npm run eval`) needs a provider key (`LLM_PROVIDER` + key — provider abstracted, see `spike/src/client.ts`). Parked because owner judged conversion a commodity; revisit only if author correction proves expensive.

### Candidate next steps (none started)
- Wire conversion (`spike/`) output INTO the collab review surface (`spike-collab/`) — end-to-end loop.
- Decide the real stack/architecture (PRD `P1-T3` ADR) off these spike learnings, then start the actual MVP build (Phase 2) — both spikes are throwaway-grade.
- Remaining P2-T4 polish: orphan re-attach merge UX, fuzzy for longer spans (diff-match-patch), real identity/persistence.

## Hard anti-scope (PRD §7, Part 4) — never reintroduce
- ❌ Replacement for Word / Google Docs (we **complement**)
- ❌ Knowledge graph (spec §3.5 / §5.1) — **deferred to v2**
- ❌ Voice input (spec §3.1) — **deferred**
- ❌ Live simultaneous editing — async, version-based only
- ❌ Read-receipts / forced acknowledgment / engagement surveillance — violates tenet #1
- ❌ "Visual richness" as the goal — the win is **information architecture / cognitive-load reduction**
- ❌ FYI / broadcast docs — reader has no stake; unwinnable
- ❌ Founders persona — secondary, deferred
- ❌ Arbitrary JS execution in artifacts — constrained safe palette only (accordions, tabs, tooltips, anchors, hover)

## Design tenets (PRD §6 — non-negotiable)
1. Serve the **reader**, not the author.
2. Structure over decoration.
3. No surveillance.
4. Reader must have a stake.
5. Opinionated by design — platform makes layout choices, not the author.

## How tasks work (PRD §12A)
- Stable IDs: `P0-T1`, `P1-T2`, etc. "Implement P2-T4" → find it in PRD §13, follow self-contained.
- **Type** tag governs what the agent may do:
  - `[AGENT]` — code-implementable by Claude Code.
  - `[HUMAN]` — research / interviews / judgment. Agent may scaffold (interview guide, tracker, notes synthesis) but **MUST NOT fabricate findings**.
  - `[HYBRID]` — agent builds scaffolding; human supplies input or makes the call.

## Phase gates are HARD STOPS (PRD §12A)
- Each phase has an **Entry Gate**. Do NOT start a phase until its gate passes.
- Phase 1 spikes are **allowed to fail**. A failed gate → **STOP and escalate to the user** for plan revision. Never auto-advance.
- The single worst failure mode: barreling into Phase 2 after a failed Phase 1 fidelity gate. Don't.

### Plan modification (2026-05-30, owner decision)
First iteration is for a **select internal user group**; goal is to observe real lift in productivity / alignment / decision-making before treating this as general-purpose. **External market validation (P0-T1, P0-T3) and the P4 external go/no-go are DEFERRED** — owner chose to jump straight to building. This is consistent with PRD §12 (dogfood-first strategy). What is NOT skipped: the **technical** spikes (P1-T1 fidelity, P1-T2 surgical edit) — they de-risk whether the product works at all, independent of market signal. Treat them as build-time quality gates.
Still required as build inputs (not validation): ≥1 real sample doc to convert.

### Plan modification #2 (2026-05-30, owner decision) — DOC-AGNOSTIC conversion
**No fixed per-document-type templates.** Document types vary and all pass through the LLM anyway, so the LLM judges what each document is and renders the structure that best serves a reader. This **supersedes** the "ONE target doc type" framing (P0-T2) and "Opinionated template(s) for the chosen doc type" (P1-T4): there is no chosen type. Tenets #2/#5 still hold — the platform owns the **comprehension principles + visual grammar + safe interaction palette** (one doc-agnostic design system), the author still makes no layout choices. What is dropped is only the *per-type structural contract*. The fidelity rubric and structural validator are now type-independent (`spike/src/rubric.ts`, `spike/src/template.ts`). Do NOT reintroduce per-document-type templates.

### Plan modification #3 (2026-05-30, owner decision) — COLLABORATION IS THE DIFFERENTIATOR; re-sequenced
Owner's call: conversion (doc→HTML) is effectively a **commodity** (ChatGPT/Claude already do it; the app + API + skills will too) and is de-risked by Draft-state author correction. The **moat and the real risk both live in the collaboration layer** — making the artifact collaborative, editable, and reader-friendly with strong feedback tools.

Re-sequencing vs PRD §12 (which said de-risk conversion first):
- **Conversion-fidelity spike (P1-T1) is PARKED** — built and kept under `spike/`, not deleted. Revisit only if author correction proves expensive.
- **Collaboration is now the first hard bet.** New hard bet = **comment-anchoring stability across author edits** (PRD P2-T4 sub-test, promoted to top risk).
- **Edit model = HYBRID:** author edits the artifact directly; reviewers get read-only + rich review tools. NO live multi-user co-editing (still anti-scope §7).
- **Source-of-truth boundary (FINAL, owner-confirmed):** after import the artifact is the living source of truth. Edit boundary:
  - *Minor edits* (wrong data point, reordering, emphasis, what-appears-first) → done IN the HTML artifact.
  - *Major rethink* (re-evaluating the proposal itself) → done in Word/GDoc → **re-imported as a fresh, renamed document** (new artifact, not a sync-back).
  There is never concurrent two-source truth — a clean handoff at import, a clean re-import for big rewrites. This is the accepted resolution of §10.4; do not build Google-Docs sync-back.
- **Linking / knowledge graph: still deferred.** Single-artifact collaboration first; cross-artifact linking comes after. Full knowledge graph stays v2.

Phase order: **0 Validation → 1 De-risk spikes → 2 MVP build → 3 Dogfood → 4 Decision gate.**
- Phase 1 entry: `P0-T2` done (target artifact chosen + sample docs exist).
- Phase 2 entry: Phase 1 exit gate passed (`P1-T1` AND `P1-T2` hit thresholds; stack ADR `P1-T3` + template `P1-T4` decided).
- **Phase 2 tasks were written before Phase 1 decisions exist** — read the `P1-T3` ADR first and flex all Phase 2 implementation detail to it. Task IDs/DoDs/tests are stable; framework/model/IR specifics are not.

## Testing model (PRD §12B) — read before writing any test
1. **Deterministic tests** — all non-AI behavior (parsing, IR, state machine, comment anchoring, version snapshot/restore, permissions, edit splicing mechanics, layout validation). Run in CI every commit.
2. **Eval tests** — all LLM output (conversion fidelity, NL-edit semantics). Require golden dataset + rubric + LLM-as-judge scorer + thresholds. Regression suite: every real failure is added to the golden set. **NOT exact-string-equality unit tests.**
3. **Manual/qualitative** — what no harness can judge (e.g. "do reviewers prefer the artifact over the Google Doc?"). Structured observation, documented. Mark explicitly.

Rule: LLM-produced output → **eval test**, never assertion of exact equality.

## Environment
- Platform: Windows (win32), PowerShell. Use PS syntax (`$null`, `$env:VAR`, backtick line-continuation).
- Git repo: remote `origin` = https://github.com/nirat25/viscollab (default branch `main`).
- Stack: **undecided** — set by the `P1-T3` ADR. Do not assume a framework/model/storage/IR until that exists.
- Spike (`spike/`) is Node/TS. **LLM provider is abstracted** (`spike/src/client.ts`): cheap OpenAI-compatible provider now (owner cost decision), Anthropic in production — swap via `LLM_PROVIDER` env, no code change.

## Working conventions
- Build exactly what the task asks (coding-standards: simplicity first, surgical changes).
- When a task is ambiguous, resolve against tenets (§6), anti-scope (§7), decision log (Part 4) — then ask if still unclear.
- North-star metric: **rate of decisions reversed/relitigated after sign-off** (lower = win). Baseline before any code ships (`P0-T5`).
