# Fidelity Rubric — doc-agnostic (rubric-v2)

No document type is assumed. The conversion LLM judges what each document is and
chooses its own structure; the rubric measures whether the artifact surfaces THIS
document's load-bearing point and structures it for reading — for any document
(PRD §10.1, P1-T1). Applied by an LLM-as-judge (`src/judge.ts`) with periodic human
spot-checks. Scores recorded per prompt + rubric version in `results/`.

| ID | Criterion | Kind | Pass condition |
|---|---|---|---|
| a | Load-bearing point surfaced | graded | The document's single most load-bearing point/purpose is at the top, plainly stated — lifted up even if the source buries it. |
| b | Structure reduces reading cost | graded | Hierarchy + grouping + progressive disclosure + anchors let a reader get the gist fast and drill down on demand. |
| c | No emphasis inversion | **zero-tolerance** | No minor point rendered more prominently than the main point. |
| d | No fabrication or omission | **zero-tolerance** | No invented content; no dropped material point. |

## Thresholds (phase gate — PRD P1-T1)
- Graded (a, b): **≥ 80%** pass across the golden set.
- Zero-tolerance (c, d): **100%** on the high-stakes subset (docs tagged `highStakes` via sidecar `.meta.json`). If none tagged, enforced across all docs.
- Structural+safety contract (`src/template.ts`), **100%**: self-contained HTML, all anchors resolve, **no `<script>` / inline JS handlers / external resources** (PRD §9 safe interaction palette).

A miss after reasonable iteration = **failed gate → HARD STOP** (PRD §12A). Escalate; do not proceed to Phase 2.

## What changed from v1 (2026-05-30)
Dropped per-document-type criteria ("decision above fold", "tradeoffs present") — those
assumed a Decision/Approval template. Criteria are now type-independent. The platform still
owns the comprehension principles + safe palette (`RENDER_SPEC`); the LLM owns the structure.

## Adversarial cases (must be in the golden set)
- **Buried lede:** a doc whose main point sits at the end (e.g. `golden/dentaltechhub.md`, Part 8). Test (a): still surfaced to the top?
- Tag `{ "highStakes": true }` so (c)/(d) are enforced at 100%.

## Regression discipline
Every real-world fidelity failure found later is added to `golden/` so it can never silently return (PRD §12B, P3-T4).
