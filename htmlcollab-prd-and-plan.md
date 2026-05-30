# HTMLCollab — Product Requirements & Execution Plan
### v1.0 — Foundational Artifact
*Working codename: "HTMLCollab" (placeholder). Last updated: 2026-05-29. Status: Hypothesis locked for build; validation ongoing.*

---

## How to read this document
This is the consolidated foundational artifact for the product. It captures the strategy, the product definition, the hard problems, and a phased execution plan. Part 4 is a decision log recording *why* key choices were made — including arguments deliberately rejected — so the team inherits the reasoning, not just the conclusions.

This is a living document. Every claim about the user is a hypothesis until external conversations confirm it. Internal dogfooding informs product quality, **not** market validation.

---

# PART 1 — STRATEGY

## 1. One-liner
A **complementary** review-and-alignment layer that sits downstream of where teams already draft (Word, Google Docs). The author pushes a refined draft of a sign-off document; the platform converts it into a structured, interactive artifact built for fast comprehension; the cross-functional team reviews, comments, and aligns. It does **not** replace the drafting tool.

## 2. The problem
Cross-functional decisions stall or go wrong because the people who must sign off don't genuinely engage with the document before approving. The author publishes a spec or business requirements doc, gets a thumbs-up and a couple of comments, and has to *assume* alignment — then discovers it was false only when the decision is reversed, relitigated, or built wrong, at which point it is expensive and trust-eroding.

### 2.1 The asymmetry that governs the whole product
The author feels the pain; the reader bears the cost of most "solutions." Read receipts, forced acknowledgment, and engagement dashboards all serve the author by **taxing the reader** — and the reader is precisely the person whose behavior must change. Anything that makes reading feel mandatory or surveilled fails on adoption.

**Therefore the only durable wedge serves the reader's self-interest:** the document is so much faster to truly absorb that reading becomes the path of least resistance. Cognitive-load reduction is the mechanism. Read-receipts are a trap.

### 2.2 The narrowing lens
Target **only** documents where the reader already has a genuine stake — must approve it, is accountable for it, is directly affected, or needs it to do their job. For those, reading is already in the reader's interest; the product's only job is to collapse the cost of it.

Explicitly **out of scope:** FYI / broadcast documents. Non-reading there is rational and unfixable by format. Most "nobody reads our docs" complaints are about broadcast docs — an unwinnable game.

## 3. Target persona
**Primary:** Product and marketing professionals who own documents that require cross-functional sign-off — product managers running spec/PRD handoffs, marketers and PMs circulating business requirements documents for approval. They live and die by getting decisions and alignment across teams that don't report to them.

**Secondary (later, not co-equal):** Founders and co-founders, who perform similar jobs but in a structurally different context (small teams, no formal sign-off process, different tooling). Deliberately deprioritized to keep the primary persona sharp.

## 4. Target artifacts
Documents that (a) require sign-off or alignment from multiple stakeholders and (b) give those stakeholders a genuine stake:
- Product specs / PRDs handed to engineering and design
- Business requirements documents (BRDs) requiring cross-functional approval
- Proposals and decision documents needing multi-party sign-off

## 5. Positioning: complementary, not replacement
The author drafts and refines where they already do. When the draft is ready, they push it to HTMLCollab for the team review-and-alignment phase.

**Why this is the right call:** it eliminates the single hardest engineering problem — building a world-class simultaneous editor — and it accepts the reality that people will not move their drafting. This is a deliberate trade, not a concession.

## 6. Design tenets (non-negotiable principles)
1. **Serve the reader, not the author.** Every feature must lower the reader's cost of comprehension. If a feature primarily serves the author at the reader's expense, it does not ship.
2. **Structure over decoration.** The win is information architecture and cognitive-load reduction, not visual richness. A plainly-styled, beautifully-structured document beats a visually rich, poorly-structured one. "Visual" is not the goal; "structured for the reader" is.
3. **No surveillance.** No read-receipts or forced acknowledgment beyond the lightest, reader-respecting signal. Engagement is earned by being easy, never compelled.
4. **Reader must have a stake.** Only target documents where reading is already in the reader's interest.
5. **Opinionated by design.** A constrained, consistent design system for each document type — the author should not make layout choices; the platform should.

## 7. What this is NOT (anti-scope)
- Not a replacement for Word or Google Docs.
- Not a website builder.
- Not a tool for FYI / broadcast / newsletter-style documents.
- Not an engagement-tracking or read-receipt product.
- Not (in v1) a knowledge graph, a voice-first tool, or a live simultaneous-editing environment.

---

# PART 2 — PRODUCT DEFINITION (MVP)

## 8. MVP feature scope
| # | Feature | MVP scope |
|---|---|---|
| 8.1 | **Input** | Upload (.docx) and paste/link from Google Docs. Voice input **deferred** (fragile multi-step pipeline; not needed to prove the thesis). |
| 8.2 | **Conversion processor** | LLM analyzes the refined draft, identifies document type and the load-bearing decision/tradeoffs, and generates a structured interactive artifact using opinionated per-type templates. Surfaces the core decision impossible-to-miss; progressively discloses supporting detail. |
| 8.3 | **Progressive disclosure** | Auto-generated structure: summary-first, expandable sections, anchored navigation, internal cross-links. The reader controls depth; the default view is the digest. |
| 8.4 | **Commenting & annotation** | Comments anchored to DOM elements (sections, headings, cards). Threaded replies, resolve/reopen, @mentions. The review surface. |
| 8.5 | **Draft → Live states** | First publish lands in Draft. Author refines via editing + regeneration. Promotion to Live shares it for review. Contains the messy correction loop before anyone sees it. |
| 8.6 | **Version history** | Snapshot per publish. Named versions. Visual diff between versions. Restore. |
| 8.7 | **Sharing & permissions** | Share by link (view / comment), workspace-level team access. |

## 9. Resolved design decisions
- **Editing model (post-conversion):** three tiers — (a) block-level edits for structure, (b) direct HTML editing for power users, (c) natural-language instruction for larger changes. First-pass generation uses a larger model; surgical edits use a smaller/faster model.
- **Collaboration model:** async, version-based. No live simultaneous editing. Publish → comment → revise.
- **Interactivity boundary:** no arbitrary JavaScript execution. A constrained, safe interaction palette only (accordions, tabs, tooltips, anchored navigation, hover states).
- **Source of truth:** the HTML artifact is a **read-only review surface**; edits happen in the source draft; the author reconciles comments manually and re-pushes. (See §10.4 — this is the chosen resolution to the central contradiction.)

## 10. The hard problems (must be actively managed)
### 10.1 Semantic fidelity
The conversion must correctly identify which point is the *main* point and emphasize it. Visual consistency is solvable with an opinionated design system; semantic correctness is not. Because the input is an already-refined draft, the author is protective of it — a conversion that shifts emphasis produces an "you messed with my good work" reaction, which is worse than failing to improve a messy doc. **Fidelity bar is high. Mitigation: edits + regeneration, with section-locking so good sections survive a regenerate.**

### 10.2 Surgical edit targeting
Browser rendering is not the problem (solved by modern frameworks). The hard tier is natural-language edits: mapping "make section 3 concise" to the exact DOM region, constraining the LLM to touch *only* that, and splicing the patch back without breaking layout. This is an AI-scoping and patch-validation problem. **Prototype it before committing to the architecture.**

### 10.3 Latency
First-generation latency is tolerable **if** the payoff is trusted, the wait is *legible* (show the work, like thinking-mode progress), and it is proportionate to perceived task size. This does **not** extend to the edit loop, which is frequent and small. **Rule: spend the long, legible wait on high-value moments (first generation, major restructure); keep the edit loop fast and local.** Note that tolerance for latency is highest among power users; the broad market is more impatient.

### 10.4 The two-source-of-truth contradiction
The source draft lives in Google Docs; comments land on the HTML artifact. Closing the edit loop (sync HTML back to Docs) means rebuilding the editor this positioning exists to avoid. **Chosen resolution:** the artifact is a read-only review surface; the author reconciles in the source and re-pushes — the same model design-review tools (Figma, PDF markup) use successfully. The validity test: is the converted artifact enough better than the Google Doc *as a review surface* to justify the split? Must be confirmed in dogfooding.

### 10.5 The surveillance temptation
The author will want to know who-read-what. Resist past the lightest touch. Crossing this line flips the reader from beneficiary to suspect and breaks tenet #1.

## 11. Explicitly deferred
Knowledge graph (the v2 platform thesis); voice input; live simultaneous editing; founders persona; external/public publishing; pricing.

---

# PART 3 — EXECUTION PLAN

## 12. Strategy
**Internal-first dogfooding.** Build a lean MVP, deploy it to your own startup teams and a few selected groups, and use the daily review-and-alignment flow as a fast feedback loop on product quality. Run external validation conversations *in parallel and separately* — these are the real market signal; internal usage is not.

**Sequencing principle:** de-risk the two hardest bets (semantic-fidelity conversion and surgical-edit targeting) *before* building the surrounding product. If either can't be made reliable, the product changes shape, and you want to know that early and cheaply.

> Timelines below are relative phases with rough effort ranges. Absolute calendar depends on build capacity (solo + AI-assisted vs. with engineers). Sizes assume lean, AI-assisted development.

---

## 12A. For the implementing agent (Claude Code) — read this first
This section makes the plan executable from a fresh session.

**Conventions**
- Every task has a stable **ID** (e.g., `P2-T4`). The user may say "implement P2-T4" — find it here and follow it self-contained.
- Each task lists: **Type**, **Depends on**, **Objective**, **Build**, **Definition of Done (DoD)**, **Tests**.
- **Type** is one of:
  - `[AGENT]` — code-implementable by Claude Code.
  - `[HUMAN]` — research, interviews, or judgment the agent must NOT fabricate or "complete." The agent may *assist* (draft a guide, synthesize notes, scaffold a tracker) but must not invent findings.
  - `[HYBRID]` — agent builds scaffolding; a human supplies input or makes the call.

**Source of truth**
- Parts 1, 2, and 4 explain *why*. When a task is ambiguous, resolve it against the Design Tenets (§6), the anti-scope (§7), and the Decision Log (Part 4). Do not reintroduce rejected ideas (read-receipts, live co-editing, voice, knowledge graph, founders persona).

**Phase gates (hard stops)**
- Each phase has an **Entry Gate**. Do NOT start a phase until its gate passes. The Phase 1 spikes are explicitly allowed to fail; if a gate fails, STOP and surface it to the user for a plan revision rather than proceeding. A diligent agent barreling into Phase 2 after a failed fidelity gate is the single most damaging failure mode here.

**Testing model (applies to all tasks)** — see §12B.

---

## 12B. Testing strategy (read before writing any test)
Two kinds of tests, never conflated:

1. **Deterministic tests** — standard pass/fail unit + integration tests. Use for all non-AI behavior: file parsing, the intermediate representation (IR), the draft→live state machine, comment anchoring, version snapshot/restore, permissions, edit splicing *mechanics*, layout/structural validation. These run in CI on every commit.

2. **Eval tests** — for LLM-dependent behavior (conversion fidelity, NL-edit semantics). These are NOT unit tests. They require:
   - A **golden dataset**: real input docs (5–10 to start, growing) paired with a documented expected outcome.
   - A **rubric**: explicit, checkable criteria (see P1-T1).
   - A **scorer**: rubric applied by an LLM-as-judge with periodic human spot-checks. Record scores per prompt/template version.
   - **Thresholds**: a quality bar that must be met to pass the phase gate. Probabilistic, not binary.
   - Treated as a **regression suite**: every real-world failure found later is added to the golden set so it can never silently return.

3. **Manual/qualitative tests** — for things no harness can judge (e.g., "do reviewers prefer the artifact over the Google Doc?"). Structured observation, documented findings. Marked explicitly.

Rule of thumb: if the output is produced by an LLM, it gets an **eval test**, not an assertion of exact string equality.

---

## 13. Milestones, tasks & tests

### PHASE 0 — Validation & Definition · ~1–2 weeks to first pass
*Goal: sharpen the bet and define "good" before building. Runs in parallel with everything; never blocks code spikes, but its outputs feed them.*
**Entry Gate:** none (starting point).
**Exit Gate:** target artifact chosen (P0-T2) and success metrics + baseline defined (P0-T5).

**P0-T1 · [HUMAN] External validation conversations**
- *Objective:* confirm the pain is real and attached to the chosen doc type.
- *Do:* 5+ interviews with product/marketing owners of sign-off docs. Ask: *"Tell me about the last time a documented decision got reversed or relitigated because someone hadn't actually engaged with it."* Agent may draft the interview guide and synthesize notes; agent must NOT invent answers.
- *DoD:* ≥5 conversations logged; one-page synthesis produced.
- *Test (gate):* Does the reversed-decision story recur unprompted across interviews? Yes → proceed. No, or the sting attaches to a different doc type → revise §3/§4 before building.

**P0-T2 · [HUMAN] Choose ONE target artifact**
- *Objective:* narrow to a single doc type for v1 (recommend PRD/spec handoff OR BRD — not both).
- *DoD:* choice documented in §4; one real sample document of that type obtained (anonymized) for the golden set.
- *Test:* a teammate can state the chosen type and see the sample.

**P0-T3 · [HUMAN] Write the concrete scenario**
- *DoD:* one page — named persona, specific document, exact alignment moment where this beats Google Docs "Share."
- *Test:* the scenario names a moment, not a category, and a skeptic can't reduce it to "just use Google Docs."

**P0-T4 · [HYBRID] Gamma.app teardown**
- *DoD:* documented analysis of where Gamma succeeds and where users hit walls; differentiation stated in one sentence. Agent can build the teardown doc from research + user notes.
- *Test:* differentiation sentence is specific and not "ours is better."

**P0-T5 · [HYBRID] Define success metrics + baseline**
- *Objective:* make §14 measurable and capture the *before* number now.
- *DoD:* metric definitions finalized; relitigation/reversal rate baselined from the user's own teams (manual count over the last N decisions). Agent can scaffold a tracking sheet.
- *Test:* a baseline number for "decisions reversed/relitigated after sign-off" exists before any code ships.

---

### PHASE 1 — De-risk the hard bets · ~2–4 weeks
*Goal: prove (or disprove) the two things that can kill the product, cheaply, before building the product around them.*
**Entry Gate:** P0-T2 done (target artifact + a few sample docs exist).
**Exit Gate:** P1-T1 AND P1-T2 both pass their thresholds. If either fails after reasonable iteration, STOP and escalate — the product shape changes.

**P1-T1 · [AGENT] Conversion-fidelity spike + eval harness**
- *Depends on:* P0-T2.
- *Objective:* prove the LLM can convert a refined sign-off doc into a structured artifact that surfaces the load-bearing decision without distorting emphasis.
- *Build:* a minimal script `input doc → IR → prompt + draft template → HTML`. Assemble a golden set (5–10 real docs). Author a fidelity rubric. Build a reusable eval harness that scores outputs against the rubric and records per-prompt-version results.
- *DoD:* harness runs end-to-end on the golden set; scores produced and stored; results written up.
- *Tests (eval):* for each golden doc the rubric checks —
  - (a) the load-bearing decision appears above the fold / in the summary;
  - (b) key tradeoffs are present and not buried;
  - (c) **no emphasis inversion** — a minor point is not promoted above the main one;
  - (d) **no fabrication or omission** of any material point.
  - *Adversarial case:* include a "buried lede" doc whose main point is in the last paragraph — is it still surfaced?
  - *Thresholds:* ≥80% pass on (a) and (b); **zero tolerance** on (c) and (d) for the high-stakes subset. Falling short after iteration = failed gate.

**P1-T2 · [AGENT] Surgical-edit targeting spike**
- *Depends on:* P1-T1 (needs a generated artifact to edit).
- *Objective:* prove an NL instruction edits only the targeted section, leaving everything else untouched, with no layout breakage.
- *Build:* given an artifact + instruction ("make section 3 concise"), produce a patched artifact via a fast model.
- *DoD:* prototype performs targeted edits across a test set of instructions.
- *Tests:*
  - **Containment (critical, deterministic):** after editing the target section, assert every other section's DOM subtree is byte/structurally identical. The LLM's tendency to "helpfully" rewrite neighbors is THE failure mode. **Bar: 100% containment — any out-of-scope mutation is a fail.**
  - **Layout integrity (deterministic):** output has no unclosed/broken tags and validates against the template's structural contract.
  - **Instruction satisfaction (eval):** the edited section actually fulfills the instruction (rubric/judge).
  - **Ambiguity edge case:** instruction with an ambiguous target ("the pricing part" when pricing appears twice) → system asks for clarification rather than guessing.

**P1-T3 · [HYBRID] Stack decision (ADR)**
- *Depends on:* P1-T1, P1-T2 (spike learnings inform it).
- *DoD:* an Architecture Decision Record: frontend framework, LLM provider + model tiers (large for first-gen, fast for edits), storage, IR format. All subsequent `[AGENT]` tasks target this stack.
- *Test:* ADR committed; rationale references spike outcomes.

**P1-T4 · [AGENT] Opinionated template(s) for the chosen doc type**
- *Depends on:* P0-T2, P1-T3.
- *Objective:* the structural + visual grammar the processor renders into (author makes no layout choices — tenet #5).
- *DoD:* template renders the golden-set outputs consistently; encodes progressive disclosure (summary-first, expandable sections, anchors).
- *Tests:* visual-regression snapshots on the golden set; structural-contract validation (required regions present, valid markup); accessibility check on disclosure controls.

**P1-T5 · [HYBRID] Clickable mock of the read-only review-surface loop**
- *Depends on:* P1-T4.
- *Objective:* validate the §10.4 model end to end before building it.
- *DoD:* a mock demonstrating author push → reviewer comment → author reconciles in source → re-push.
- *Test (manual):* 2–3 internal users walk the loop; capture whether it feels coherent or whether the two-source split is confusing. This is a load-bearing assumption — document the finding honestly.

---

### PHASE 2 — MVP build (internal alpha) · ~4–8 weeks
*Goal: a usable end-to-end loop for the one chosen document type.*
**Entry Gate:** Phase 1 Exit Gate passed (both spikes hit thresholds; stack + template decided). Do not start otherwise.
**Exit Gate:** a user can upload a doc, get a faithful artifact, share it, receive comments, edit surgically, and restore a version — all green in CI.

> **Note for implementing agent:** Phase 2 tasks were written before Phase 1 decisions exist. Before implementing any Phase 2 task, read the P1-T3 ADR first — it records the chosen frontend framework, LLM provider + model tiers, storage layer, and IR format. Adapt every Phase 2 implementation detail to those decisions. The task IDs, DoDs, test cases, and testing philosophy are the stable part; the implementation specifics (which framework, which model, how the IR is shaped) must flex to match what Phase 1 actually decided. Do not treat the Phase 2 task text as a contract written against real decisions — it was written before those decisions existed.

**P2-T1 · [AGENT] Input ingestion → IR**
- *Depends on:* P1-T3.
- *Build:* accept `.docx` upload and Google Docs paste/link; normalize to the canonical IR.
- *DoD:* both inputs produce a valid IR preserving headings, lists, tables, images, emphasis.
- *Tests (deterministic):* per-element parse tests (heading/list/table/image → correct IR); malformed/empty file → graceful error, no crash; oversized doc → handled or paginated within defined limits; mixed-formatting GDoc paste → correct IR.

**P2-T2 · [AGENT] Conversion pipeline (productionize P1-T1)**
- *Depends on:* P2-T1, P1-T4.
- *Build:* `IR → structured HTML artifact` via the processor; legible progress/loading state during generation.
- *DoD:* generates artifacts for the chosen doc type at the Phase-1 fidelity bar.
- *Tests:* **the P1-T1 eval harness runs in CI as the regression gate** (fidelity must not drop below threshold on any commit); structural-equivalence check (same input + same prompt version → structurally equivalent output); loading state renders progress, not a blank spinner (latency tenet, §10.3).

**P2-T3 · [AGENT] Progressive-disclosure renderer**
- *Depends on:* P2-T2.
- *Build:* summary-first view, expandable sections, anchored navigation, internal cross-links.
- *DoD:* default view shows the digest, not the full text; reader controls depth.
- *Tests (deterministic):* every section has a resolvable anchor; nav links jump correctly; expand/collapse toggles and persists state; keyboard accessibility (tab/enter) on all disclosure controls; default render is collapsed-to-digest.

**P2-T4 · [AGENT] DOM-anchored commenting**
- *Depends on:* P2-T3.
- *Build:* comments anchored to DOM elements; threaded replies; resolve/reopen; @mentions.
- *DoD:* the review surface works against a rendered artifact.
- *Tests (deterministic):* anchor persistence — a comment on section A survives a re-render of unrelated sections; **anchor-on-edited-target behavior is defined and tested** — when the anchored section is later edited (P2-T6), the comment either re-anchors or is flagged stale (pick one, test it; ties to §10.4); thread CRUD; resolve greys/hides and reopen restores; @mention writes a notification record.

**P2-T5 · [AGENT] Draft → Live state machine**
- *Depends on:* P2-T2.
- *Build:* first publish = Draft; promote = Live; regeneration allowed in Draft; section-locking.
- *DoD:* messy correction loop is contained in Draft; promotion is deliberate.
- *Tests (deterministic):* illegal transitions rejected; a Draft cannot be shared externally; **locked section is excluded from regeneration — assert its subtree is unchanged after a regenerate** (mirrors P1-T2 containment); Live artifact is immutable except via a new version.

**P2-T6 · [AGENT] Surgical edit loop (productionize P1-T2)**
- *Depends on:* P1-T2, P2-T2.
- *Build:* three-tier editing — (a) block-level, (b) direct HTML, (c) NL instruction (fast model). Local and fast.
- *DoD:* author can make targeted changes without full regeneration.
- *Tests:* **P1-T2 containment + layout tests run in CI as the regression gate**; latency-budget test (single-section NL edit round-trip under target, e.g., the edit loop stays fast per §10.3); direct-HTML edits validate against the structural contract before save (reject breaking edits).

**P2-T7 · [AGENT] Version history + diff**
- *Depends on:* P2-T5.
- *Build:* snapshot per publish; named versions; visual diff; restore.
- *DoD:* author can compare and roll back.
- *Tests (deterministic):* snapshot immutability; **restore reproduces the prior artifact exactly** (structural equality); diff highlights only changed subtrees (cross-check with P2-T6 containment); version-list ordering correct.

**P2-T8 · [AGENT] Sharing + permissions**
- *Depends on:* P2-T4, P2-T5.
- *Build:* share-by-link (view / comment), workspace-level access.
- *DoD:* the right people can do the right things; the wrong people can't.
- *Tests (deterministic):* a view link cannot comment; a non-workspace user is blocked; link revocation takes effect immediately; a Draft is never externally shareable.

---

### PHASE 3 — Internal dogfood · ~3–4 weeks rolling
*Goal: product-quality feedback and the read-surface validity test (§10.4).*
**Entry Gate:** Phase 2 Exit Gate passed (end-to-end loop green in CI).
**Exit Gate:** ≥N real sign-off cycles run through the tool; the §10.4 finding documented; top friction list produced.

**P3-T1 · [AGENT] Outcome instrumentation (NOT surveillance)**
- *Depends on:* P2-T8.
- *Build:* capture outcome signals — comment substance, time-to-sign-off, a tag for later-reversed decisions. Compute the §14 metrics.
- *DoD:* metrics dashboard reads from real usage.
- *Tests:* metrics compute correctly on seed data; **privacy guardrail test — assert the events schema contains NO per-user read/open tracking** (enforces tenet #3); no field exists that could become a read-receipt.

**P3-T2 · [HUMAN] Roll out to own teams + selected groups**
- *DoD:* the tool is the required surface for the chosen doc type on real work; weekly feedback loop running.
- *Test:* real documents are flowing through it (not test fixtures).

**P3-T3 · [HUMAN] §10.4 read-surface preference test**
- *Objective:* the load-bearing assumption — is the artifact preferred over the Google Doc as a *review surface*?
- *DoD:* structured observation across several cycles; finding documented honestly (including "no").
- *Test (manual):* reviewers given the choice — which do they actually comment in? If they drift back to the Doc, the thesis is in trouble; investigate why before scaling.

**P3-T4 · [HYBRID] Iterate conversion + edit loop against real failures**
- *Depends on:* P3-T2.
- *Build:* every real-world fidelity or containment failure is added to the golden/regression set, then fixed.
- *DoD:* regression set grows with each cycle.
- *Test:* previously-fixed failures stay fixed on every CI run (no silent regressions).

---

### PHASE 4 — Decision gate: refine or open up · ~2 weeks
*Goal: decide what dogfood + external conversations actually proved.*
**Entry Gate:** Phase 3 Exit Gate passed.
**Exit Gate:** an explicit go/no-go on external beta, gated on the *external* signal — not internal adoption.

**P4-T1 · [HUMAN] Synthesize internal + external findings** — *DoD:* one-page readout combining dogfood metrics (esp. the relitigation-rate delta vs. the P0-T5 baseline) and external interview signal.
**P4-T2 · [AGENT] Resolve top friction from Phase 3** — *DoD:* the top friction items closed; *Test:* their specific failure cases added to the regression suite and green.
**P4-T3 · [HUMAN] Go/no-go decision** — *DoD:* documented decision. *Gate:* open to external beta only if the external conversations surfaced the stinging-pain story AND the relitigation rate moved on internal use. Internal adoption alone is NOT sufficient.
**P4-T4 · [HYBRID] (If go) external onboarding + pricing experiments** — *DoD:* onboarding flow for users who are NOT invested in you; pricing tests designed.

## 14. Success metrics
Measure outcomes that reflect the reader's experience and the alignment result — never raw "did they open it" surveillance.
- **Comprehension proxy:** quality and specificity of comments (substantive engagement vs. rubber-stamp 👍).
- **Alignment durability (north star):** rate of decisions reversed/relitigated after sign-off — maps directly to the core pain. Baseline it now (P0-T5); lower is the win.
- **Time-to-sign-off:** does the review cycle close faster than in Google Docs?
- **Reader-pull (not push):** do reviewers engage without being chased? Unprompted engagement is the truest signal the cost-of-reading dropped.
- **Author trust in conversion:** how often must the author correct the generated artifact before promoting to Live? (Tracks §10.1 fidelity.)

## 15. Risks to the plan
| Risk | Mitigation |
|---|---|
| Internal adoption mistaken for market validation | External conversations are the *only* PMF signal (P4-T3 gate); dogfood informs quality only. |
| Conversion fidelity never reaches the trust bar | P1-T1 fails fast and cheap; Phase 1 gate stops the build before money is spent. |
| Agent proceeds past a failed phase gate | Gates are hard stops in §12A; a failed gate escalates to the user, never auto-advances. |
| Reviewers don't prefer the artifact over Google Docs | Tested directly in P3-T3; it's the load-bearing assumption. |
| Eval tests written as brittle unit tests | §12B mandates rubric + golden-set evals for all LLM output. |
| Scope creep back toward knowledge graph / voice / live editing | Anti-scope (§7) + Decision Log (Part 4) are explicit; defer ruthlessly. |
| Persona blur (founders, broadcast docs) | Primary persona and target-artifact list fixed; revisit only with evidence. |

---

# PART 4 — DECISION LOG
*Why key choices were made, including rejected arguments. Inherit the reasoning, not just the conclusion.*

| Decision | Resolution | Reasoning |
|---|---|---|
| Replace vs. complement Word/Docs | **Complement** | Eliminates the hardest problem (simultaneous editor); accepts that people won't move drafting. |
| What drives the value | **Cognitive-load reduction** | "People are visual" is empirically weak; structured information reduces load for everyone. Pursue information architecture, not richness. |
| Who the product serves | **The reader** | The author feels the pain but the reader's behavior must change; reader-taxing solutions fail. |
| Which documents | **Sign-off docs where reader has a stake** | Reading is already in the reader's interest; format only lowers the cost. FYI/broadcast docs are unwinnable. |
| Source of truth | **Read-only review surface + manual reconciliation** | Closing the edit loop rebuilds the editor we avoided; design-review tools prove the read-only model works. |
| Collaboration timing | **Async, version-based** | Live co-editing on HTML is an unsolved hard problem and unnecessary to prove the thesis. |
| Voice input | **Deferred** | Four-step pipeline (voice→transcribe→convert→HTML) compounds errors; not needed for v1. |
| Knowledge graph | **Deferred to v2** | Compelling platform thesis but a second product; would sink v1 if built in parallel. |
| **Rejected:** "latency is good friction that improves what authors publish" | **Cut** | Latency is dead time *after* the publish decision; not productive friction. Design reflection explicitly if wanted. |
| **Rejected:** read-receipts / forced acknowledgment | **Cut** | Serves the author by taxing the reader; violates the core design tenet. |
| Founders persona | **Secondary, deferred** | Different context (no formal sign-off, tiny teams); keeps the primary persona sharp. |

---

## Immediate next action
Phase 0, first task: book the five external conversations and ask the reversed-decision question. If that story comes back fast and stinging, proceed with confidence. If it doesn't — or if the sting attaches to a *different* document type — follow the sting, not this document. The durable part of this work is the lens (reader must have a stake; serve the reader; collapse the cost of reading). The specific document type is the part user research is allowed to overrule.

*End of v1.0.*
