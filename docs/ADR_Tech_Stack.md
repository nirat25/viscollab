# Architecture Decision Record (ADR): Tech Stack for HTMLCollab

**Date:** June 8, 2026  
**Status:** Accepted (2026-07-12) — see Addendum below.  
**Author:** Principal Engineer (L8)  

## Context
HTMLCollab is a visual collaboration platform that converts unstructured or lightly-structured documents (Word, Google Docs) into structured, interactive HTML artifacts via LLMs. Key product requirements include progressive disclosure (collapsible sections, drill-downs), DOM-anchored commenting, and strict draft/live state machines. 

This document outlines the architectural decisions for the four core pillars of the MVP tech stack: Frontend Framework, LLM Provider, Storage Layer, and Intermediate Representation (IR) Format.

---

## Principal (L8) Engineer Consultation Notes
*During the drafting of this ADR, a Principal (L8) Engineer was consulted to review the requirements and propose a foundational tech stack. Their review notes and recommendations have been integrated into this document. The key insights from the consultation were:*
- *ProseMirror (via TipTap) is the absolute gold standard for DOM-anchored annotations and complex document state; avoiding it would require rebuilding massive amounts of editor logic.*
- *Anthropic's Claude family outperforms others in generating and reasoning over complex structural HTML/XML.*
- *Storing an Abstract Syntax Tree (AST) in Postgres `JSONB` offers the perfect balance of relational integrity (for comments/state) and schema flexibility (for documents).*
- *The IR should be a Semantic JSON AST parsed from stripped-down HTML to maximize token efficiency and map directly to the frontend schema.*

---

## 1. Frontend Framework

### Requirements
- Handle complex DOM state and real-time updates.
- Support progressive disclosure (expandable/collapsible interactive HTML).
- Support granular, DOM-anchored commenting.
- Handle document diffing (visualizing changes between draft and live states).

### Options Considered
- **React + ProseMirror / TipTap:** Excellent ecosystem, mature state management, ProseMirror is the gold standard for structured document/DOM manipulation and anchored annotations.
- **Vue / Svelte:** Lighter weight, but smaller ecosystem for complex document editors.
- **Vanilla Web Components:** Highly performant, but high development overhead for MVP.

### Recommendation: React + TipTap (built on ProseMirror) + Next.js
* **Why:** TipTap provides a headless, framework-agnostic wrapper around ProseMirror but has first-class React bindings. ProseMirror's architecture strictly enforces a document schema and handles complex DOM state natively. 
* **Anchored Comments:** ProseMirror's mark and decoration APIs are explicitly designed for inline annotations (like anchored comments) that survive document edits.
* **Diffing:** We can leverage `prosemirror-changeset` or similar libraries to compute and render semantic diffs between draft and live ASTs.
* **Progressive Disclosure:** React components can be rendered *inside* TipTap nodes (NodeViews), allowing us to embed complex interactive widgets (accordions, tabs) directly into the generated document. Next.js provides the API route scaffolding needed to interface securely with our LLM layer.

---

## 2. LLM Provider & Model Tiers

### Requirements
- **First-Gen (Large):** High semantic fidelity, strong adherence to complex formatting/HTML generation, large context window for digesting whole documents.
- **Surgical Edits (Fast):** Low latency, cost-effective, capable of making natural language (NL) driven tweaks to specific DOM nodes without rewriting the whole document.

### Options Considered
- **OpenAI:** GPT-4o (Large) + GPT-4o-mini (Fast). Standard choice, highly reliable JSON/structured output.
- **Anthropic:** Claude 3.5 Sonnet / Claude 3 Opus (Large) + Claude 3 Haiku (Fast). Unmatched at coding/HTML generation and parsing massive document contexts.

### Recommendation: Anthropic (Claude 3.5 Sonnet & Claude 3 Haiku)
* **First-Gen ("Large" Tier) - Claude 3.5 Sonnet:** Sonnet is currently the industry leader in generating complex, valid HTML/UI components and adheres strictly to structural prompts. Its 200k context window easily handles large Word/GDocs conversions.
* **Surgical Edits ("Fast" Tier) - Claude 3 Haiku:** Extremely fast and cheap. Perfect for "change this paragraph to be more professional" or "turn this list into a table." We will pass only the specific TipTap JSON node + surrounding context to Haiku, keeping latency sub-second.
* *Tradeoff:* Anthropic's tool-use (function calling) is slightly less rigid than OpenAI's strict JSON mode, but their natural capability to output structured XML/HTML is vastly superior, which aligns better with our HTML artifact goal.

---

## 3. Storage Layer

### Requirements
- Store versioned HTML artifacts reliably.
- Store anchored comments associated with specific document versions.
- Support a draft/live state machine (workflow states).

### Options Considered
- **NoSQL (MongoDB/DynamoDB):** Flexible schema, good for nested document ASTs. Weak on relational integrity (e.g., tying comments to users and specific artifact versions).
- **PostgreSQL:** Strong ACID guarantees, robust relational mapping, excellent JSON support via `JSONB`.

### Recommendation: PostgreSQL (via Prisma or Drizzle ORM) + AWS S3 (for static assets)
* **Why:** The relationship between Workspaces, Documents, Artifact Versions, Comments, and Users is inherently relational. 
* **Versioned Artifacts:** We will store the document not as raw HTML, but as a JSON Abstract Syntax Tree (AST) generated by TipTap. This AST will be stored in a `JSONB` column in a `DocumentVersions` table. 
* **State Machine:** An `Artifact` table will have a `status` enum (`DRAFT`, `IN_REVIEW`, `LIVE`). The `DocumentVersions` table acts as an append-only ledger.
* **Comments:** A `Comments` table will hold a foreign key to the `DocumentVersions` table and store the start/end index (or ProseMirror node ID) to anchor the comment.
* *Note:* If the JSONB payloads get excessively large (>10MB), we can offload the actual AST payload to AWS S3 and store the S3 URI in Postgres, but for an MVP, direct Postgres JSONB storage is vastly simpler and performant.

---

## 4. Intermediate Representation (IR) Format

### Requirements
- Normalize messy inputs (Word, Google Docs).
- Serve as a clean, semantic input to the LLM.

### Options Considered
- **Markdown:** Too lossy. We lose tables with merged cells, complex lists, and semantic metadata.
- **Raw HTML:** Too noisy. Word-generated HTML is notoriously bloated (e.g., `mso-` tags), which wastes LLM tokens and confuses generation.
- **Custom JSON AST:** Clean, explicit, easily mapped to our frontend TipTap schema.

### Recommendation: Semantic JSON AST (TipTap/ProseMirror Compatible)
* **Ingestion Pipeline:** 
  1. Use `mammoth.js` to convert `.docx` to a clean, stripped-down HTML format (ignoring visual styling, keeping semantics like `<h1>`, `<p>`, `<table>`).
  2. Parse the clean HTML into our **JSON AST format** (aligning with our frontend TipTap schema).
* **LLM Hand-off:** We feed this structured JSON AST to the LLM (along with system prompts defining our progressive disclosure components). The LLM is instructed to map standard nodes (like long lists) into specialized HTMLCollab nodes (like `<CollapsibleSection>`).
* **Why this works:** Feeding JSON to the LLM is highly token-efficient. When the LLM returns the modified JSON AST, we can directly inject it into the TipTap editor without error-prone HTML parsing on the client. It guarantees the LLM outputs data that exactly matches our frontend's document schema.

---

## 5. Authentication Layer

### Requirements
- Provide secure session management for an internal-first MVP.
- Allow dynamic inviting of new team members and external stakeholders.
- Enforce strict role-based access control (RBAC) at the document and workspace levels (Owner, Collaborator, Commenter, Viewer).
- Must seamlessly integrate with the Next.js App Router (SSR and Server Components).

### Options Considered
- **Stateless NextAuth.js (Hardcoded Whitelist):** Highly secure and zero-infrastructure, but fails to scale when needing to dynamically invite new users without a code deployment.
- **Clerk:** Excellent out-of-the-box UI and dashboard for inviting users, but introduces heavy SaaS dependency, dictating UI/UX for a purely internal tool.
- **Firebase Auth:** Extremely robust, but integration with Next.js Server Components and strict SSR session verification requires complex boilerplate via Firebase Admin SDK.

### Recommendation: NextAuth.js + PostgreSQL (via Prisma/Drizzle)
* **Why:** NextAuth provides the simplest, most native integration with Next.js App Router while still letting us fully control the user schema.
* **Scalability:** By wiring NextAuth to the same PostgreSQL database chosen for the Storage Layer (via the `@next-auth/prisma-adapter`), we gain the ability to dynamically manage users, assign roles, and revoke access in the database without altering the codebase.
* **Identity:** We can enforce authentication strictly via an OAuth provider like Google Workspace (ensuring users belong to the corporate domain) while managing their granular authorization roles in our Postgres tables.

---

## Summary of MVP Architecture
1. **Frontend:** Next.js + React + TipTap (ProseMirror core).
2. **LLM:** Anthropic Claude 3.5 Sonnet (Initial Generation) + Claude 3 Haiku (Surgical Edits).
3. **Storage:** PostgreSQL (JSONB for ASTs, Relational for State/Comments).
4. **IR Format:** Clean JSON AST (compatible with the frontend editor schema), generated via semantic HTML stripping (Mammoth.js).
5. **Authentication:** NextAuth.js (Auth.js) backed by PostgreSQL to manage scalable team invites and role-based access.

---

## Addendum — 2026-07-12 (Accepted): Semantic-model rebuild

This addendum does not rewrite the analysis above; it records what was actually decided and implemented as the ADR moved from Proposed to Accepted, per the rebuild governed by `docs/visual-decision-room-plan.md` (product/phase plan) and `docs/rebuild-architecture.md` (BINDING architecture brief, Phases 0–6).

- **Frontend framework — confirmed, now being implemented.** TipTap/ProseMirror + React + Next.js, as recommended in §1, is confirmed and is the framework the rebuild is actively implementing (`web/` — Next.js app; TipTap read-only editor shell under `web/src/components/tiptap/`).
- **Canonical data model changes.** §4's "Clean JSON AST … generated via semantic HTML stripping" is superseded as the *canonical* model. The canonical data model is now the **`SemanticArtifact`** (semantic JSON — decisions, claims, evidence, assumptions, risks, options, tradeoffs, actions, questions, stakeholders; see `docs/rebuild-architecture.md` §3.1, implemented under `app/src/semantic/`). A deterministic **`VisualPlan`** (`app/src/visual/`) is planned from the `SemanticArtifact`, and TipTap JSON is *projected* from `SemanticArtifact + VisualPlan`. **HTML is a legacy projection/export only, never the source of truth.**
- **LLM output contract tightened.** The LLM emits **structured semantic JSON only** — never final HTML and never TipTap JSON directly. Extraction and validation are separated: the model returns semantic JSON, which is validated (`app/src/semantic/schema.ts`, hand-rolled — no `zod`) before anything is rendered. Visual planning and TipTap projection are pure deterministic code downstream of that JSON, not further LLM output.
- **LLM provider/models — names in §2 are superseded by the live configuration.** §2 above names "Claude 3.5 Sonnet / Claude 3 Haiku" as the recommended model tier; that was aspirational Phase-1 text. The actual, current models are configured in `app/src/convert/client.ts` and are **env-overridable**: `claude-sonnet-4-6` for the `convert`/`judge` roles, `claude-haiku-4-5` for the `edit` role (defaults; override via the role's env key, e.g. `EXTRACT_MODEL` for the new `extract` role added by the rebuild). Follow the code, not the model names in §2.
- **Storage — §3's ORM recommendation is superseded by the live implementation.** §3 recommends "PostgreSQL (via Prisma or Drizzle ORM)." The live implementation uses **raw `pg`**, not an ORM: a single `collab_state(key, value JSONB)` table (`web/src/app/api/collab/db.ts`) holding per-document state blobs (documents, workspaces, users, comments, and — as of this rebuild — `semanticArtifact`/`visualPlan`) as JSONB. This matches §3's fallback note ("direct Postgres JSONB storage is vastly simpler … for an MVP") more than its headline ORM recommendation. **Table-per-entity migration (documents, versions, semantic artifacts, visual plans, comments, verdicts as first-class tables) is deferred to Phase 9 of the rebuild plan** (`docs/visual-decision-room-plan.md`, "Persistence And Compatibility") — not done in this run.
- **Everything else in this ADR (§1 frontend rationale, §5 authentication) stands as originally written and is not superseded by this addendum.**
