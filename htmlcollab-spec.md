# HTMLCollab — Product Spec v0.3
*Last updated: 2026-05-29 | Status: Pre-ideation / Discovery*

---

## 1. One-liner
A visual collaboration platform where the native unit of sharing is a live HTML document — not a flat text file — enabling teams to publish, comment on, and iterate over richly interactive content the way they currently do in Google Docs.

---

## 2. Core Insight
Most collaboration tools produce documents that accumulate and go unread. They are text-heavy, flat, and passive. HTMLCollab inverts the default: content is ingested in any form the user has it (voice, upload, link), transformed by LLM into a visually expressive, interactive HTML artifact, and shared in a way that is actually consumed — because it is designed for reading, not just writing.

The key shift: **the author's job is to provide the raw content; the platform's job is to make it worth reading.**

HTML as the native format is not a technical choice for its own sake — it enables progressive disclosure (long documents don't need to be long to the reader), hyperlinking between related artifacts, and a connected knowledge graph across a team's entire content corpus.

---

## 3. Key Features (v1 Scope)

### 3.1 Multi-Modal Input
Users can bring content in through any of three paths:
- **Upload**: Word/PDF document uploaded and parsed
- **Link**: Google Doc URL ingested via API
- **Voice**: Spoken input transcribed via LLM, then processed
- All paths funnel into the same LLM-powered conversion pipeline before publishing

### 3.2 LLM-Powered Visual Conversion ("The Processor")
- When user triggers "Publish", the LLM analyzes the full content and makes structural decisions:
  - What type of document is this? (strategy doc, report, proposal, meeting notes...)
  - What is the visual grammar that fits this content type?
  - What should be progressively disclosed vs. immediately visible?
  - Which sections relate to each other and should be hyperlinked?
- Output is a complete HTML artifact: layout, hierarchy, navigation, interactive elements, internal links — all generated
- User can request re-generation with guidance ("make this more executive-facing", "expand the detail on section 3")
- This is the core differentiator — not an editor, but a **content-to-artifact pipeline**

### 3.3 Progressive Disclosure by Default
- Long-form content is restructured for reading, not just formatted
- Chapters, accordions, tabbed sections, and anchor links are generated automatically
- The reader controls depth; the default view is the digest, not the full document
- This directly addresses the "6-page doc nobody reads" problem

### 3.4 HTML-Native Document Model
- Every published artifact is a valid, self-contained HTML file
- Stored and versioned as HTML
- Shareable via URL with view/comment/edit permissions
- Can be exported as a standalone HTML file or published as a live URL

### 3.5 Connected Knowledge Graph
- Every artifact lives in a workspace graph
- Internal hyperlinks between artifacts are tracked and visualized
- Graph view shows how documents relate — what spawned what, what references what
- When a new document is created, the LLM can suggest links to existing artifacts in the workspace
- This replaces the "directory of unread files" with a navigable knowledge web

### 3.6 Commenting & Annotation
- Inline comments anchored to DOM elements (sections, cards, headings)
- Threaded replies; resolve/reopen workflow
- @mentions with notifications
- Comments do not disrupt the rendered artifact view

### 3.7 Version History
- Versioned at the artifact level (each publish is a version)
- Named snapshots ("Sent to exec team", "Post-workshop revision")
- Visual diff between versions — layout-level changes, not just text diffs
- Restore to any prior version

### 3.8 Sharing & Permissions
- Share by link: view-only, comment, or edit
- Workspace-level team access
- Public publish: artifact becomes a live URL accessible outside the workspace

### 3.9 Draft → Live State Model
- First publish always lands in **Draft** state
- User refines via editing + regeneration while in draft
- Once finalized, artifact is promoted to **Live** state and shared
- Provides a natural containment zone for the messy LLM-output-correction loop before anyone else sees it

---

## 4. What Makes This Different from Existing Tools

| Tool | Gap this fills |
|---|---|
| Google Docs | Docs are flat text; no native HTML rendering; no interactive elements |
| Notion | Blocks export to Markdown/HTML but the live document isn't HTML; limited interactivity |
| CodePen / JSFiddle | No collaboration model; no comments; no document-first UX |
| Webflow | Builder for websites, not for team document collaboration; high complexity |
| Coda / Airtable | Data-first, not document-first; HTML is not the source format |

---

## 5. Primary Use Cases (Hypothesized)

**→ GTM BEACHHEAD (decided): "documents that must be read by many, repeatedly."**
Onboarding material, canonical product/strategy specs, operating playbooks, team handbooks. Chosen because it is funded-but-unsolved demand (Confluence/SharePoint are deployed AND hated), it has a clear "did it get consumed?" success metric, and it sidesteps a head-on fight with Gamma. Expansion path from this beachhead (toward broader strategy-doc artifacts, then the knowledge graph) to be defined after the beachhead is validated.

Adjacent use cases (later):
1. **Strategy & planning teams** turning long strategy docs into navigable, exec-ready artifacts
2. **Agencies/consultants** delivering client work as interactive artifacts instead of static PDFs
3. **Product/design teams** linking specs and decision docs into a connected knowledge graph
4. **Voice-first users** who dictate a brief and get a polished artifact (lowest priority; fragile pipeline)

---

## 6. Open Questions

### 6.1 ~~The Conversion Problem~~ → RESOLVED
LLM-driven. The processor analyzes content holistically and makes structural decisions. User can prompt for regeneration. Rule-based fallback for common patterns (tables, lists) as a reliability floor.

### 6.2 ~~The Editing Model~~ → RESOLVED (MVP)
Three-tier editing: (a) block-level editing for structural changes, (b) direct HTML editing for power users, (c) natural-language instruction for larger changes ("make section 3 more concise"). First-pass generation uses a larger model (e.g. Opus); surgical edits use a smaller/faster model (e.g. Sonnet).

### 6.3 ~~Collaboration Conflict~~ → RESOLVED (MVP)
Version-based, async collaboration. No live simultaneous editing in MVP. Publish → comment → revise cycle.

### 6.4 ~~Interactivity Boundary~~ → RESOLVED (MVP)
No arbitrary JS execution. Constrained, safe interaction palette only (accordions, tabs, tooltips, anchor navigation, hover states).

### 6.5 ~~Knowledge Graph~~ → DEFERRED (Post-MVP)
Not in MVP scope. Positioned as the v2 platform thesis — the feature that turns a document tool into a connected knowledge system. Build the core pipeline first.

---

## 6A. THE CORE PROBLEM — REFINED (Most Important Section)

The strategic premise: *"Organizations are drowning in lengthy, unwieldy, zero-utility documents that nobody reads."*

**Refined thesis (post-debate):** Most documents are write-dominant with a *read tail*. The author needs to write the doc (to think, to record), AND a smaller set of people need to consume it well enough to align. That read tail is real and underserved by text-heavy formats. The product targets the read tail — making the documents that genuinely need consumption actually get consumed.

**The correct foundation: cognitive load, NOT "people are visual."**
- The "visual learner" premise is empirically weak and leads to the wrong product (chasing richness — charts, widgets, interactivity — as the win)
- The defensible premise: well-structured information with clear hierarchy + progressive disclosure reduces cognitive load *for everyone*
- Design implication: pursue **information architecture**, not visual richness. A plainly-typeset doc with excellent structure beats a visually rich one that is structured badly.
- "Visual" is a red herring; "structured for the reader" is the win.

**The strongest wedge may be the one currently being dismissed.**
- The "read by many, repeatedly" use case (onboarding, canonical specs, operating playbooks) was dismissed as "already well-addressed"
- This is backwards. Confluence/SharePoint are widely deployed AND widely hated — heavy investment in something that still fails is the strongest signal of durable, unsolved demand
- Compete *toward* expensive-but-unsolved problems, not away from them
- The broad "every strategy doc → beautiful artifact" framing is the head-on fight with Gamma. The narrower read-tail wedge sidesteps it.

**Arguments to drop:**
- "Higher creation cost (LLM latency) is good friction that makes authors rethink what to publish." Latency is dead time *after* the publish decision is made; it is not productive friction. If author reflection is desired, design it explicitly into the flow (e.g. prompt: "Who must read this, and what should change in their head after?"). Do not rely on slowness as a proxy for thought.

**The consumption-burden irony to hold:**
- If the author must carefully proofread the AI's restructuring to confirm emphasis wasn't distorted, the reading burden moves from audience to author. Possibly still a net win (one careful read enables many easy ones) — but it is a real cost, not zero.

**Action: validate the read tail with real users before any build. Ask: "Who read the last strategy doc you made, and did it change what they did?"**

---

## 7. Risks & Challenges

| Risk | Status / Mitigation | Remaining sharp edge |
|---|---|---|
| LLM output quality and consistency | Differentiate via opinionated, constrained design system | Visual *consistency* is solvable this way. Semantic *correctness* — the LLM correctly identifying which point is the main point and emphasizing it — is NOT solved by aesthetic opinionation. This is the real hard part. |
| Post-generation editing | Surgical edits via smaller/faster model (Sonnet) | Browser *rendering* is solved (virtual DOM / reconciliation) — not the concern. Block rearranging is near-solved (Notion-class editors). The hard tier is **natural-language edits**: mapping "make section 3 concise" to the exact DOM region, constraining the LLM to touch ONLY that, and splicing the patch back without breaking layout. This is an AI-scoping + patch-validation problem. Prototype it early. |
| LLM latency at publish | First-gen latency tolerable IF payoff is trusted + wait is **legible** (show the work, like thinking-mode progress) + proportionate to perceived task size | The thinking-mode analogy only covers *one-time, opt-in, legible* waits. It does NOT cover the edit loop (frequent, small, iterative). Rule: spend the long legible wait on high-value moments (first generation, major restructure); keep the edit loop fast and local. Note: tolerance-for-latency is highest among power users; broad knowledge-worker market is more impatient — don't over-generalize. |
| Async-first collaboration | Chosen | Validate that target users don't expect live co-editing and feel the absence. |
| Bad artifact recovery | Regeneration + Draft state before Live | Regeneration is a blunt instrument — it may fix one thing and break another. Needs a way to lock good sections while regenerating bad ones. |

---

## 8. Comparable Prior Art to Study

- **Gamma.app** — closest current analog: AI converts content into visual slide/doc artifacts; study their editing model and where it frustrates users
- **Notion AI** — LLM-assisted content within a block editor; where does it fall short?
- **Coda** — doc-as-app philosophy; why hasn't it won?
- **Observable** — reactive notebooks with live JS; knowledge graph of linked notebooks
- **Roam Research / Obsidian** — bidirectional linking and knowledge graph model
- **Google Docs** — commenting and version history UX benchmark
- **Confluence** — the incumbent "unread document graveyard" this product competes against

---

## 9. Next Steps

- [ ] **One concrete scenario**: write a specific narrative — person, document, moment — where this does something no existing tool can. This is the product thesis test.
- [ ] **Study Gamma.app deeply**: it is the closest analog. Understand where it succeeds and where users hit walls. Differentiation must be explicit.
- [ ] **Define the editing model**: what happens after the LLM generates the artifact? This is the primary UX problem.
- [ ] **Scope the knowledge graph**: is it v1 or v2? It's compelling but risky to build alongside the core pipeline.
- [ ] **Validate the async-first assumption**: do target users need live simultaneous editing, or is a publish→comment→revise cycle acceptable?
- [ ] **5–10 user conversations**: specifically target people who produce long-form strategy/planning docs and ask how often those docs get read.

---

*This is a living document. All feature scope is provisional until user research validates demand.*
