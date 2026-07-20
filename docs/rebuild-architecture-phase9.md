# Viscollab Rebuild — Architecture Brief (Phase 9: Durable Persistence, Identity, and RBAC)

Date: **2026-07-20**. Status: **BINDING for Phase 9**. This brief is subordinate to
`docs/rebuild-architecture.md` §0 and to the Phase-7/Phase-8 briefs where their contracts remain
relevant. It resolves the Phase-9 ambiguity in `docs/visual-decision-room-plan.md`; where they
conflict, this brief wins. The owner's 2026-07-20 request clears the Phase-9 architecture gate.

Phase 9 turns the current prototype blob store into an account-gated, versioned decision-room
system. It is deliberately a persistence and authorization phase, not a redesign of the review
experience or an invitation-flow polish phase.

## 0. Non-negotiable boundaries

1. Accounts are required for every role. There is no anonymous room, share-token, global-role, or
   client-held authorization fallback. Retire the legacy anonymous share helpers and token API
   surface; do not make them reachable through new compatibility code.
2. Authorization is server-derived from an immutable account ID and **direct document membership**.
   Workspace membership permits workspace navigation only; it never grants implicit room access.
3. `SemanticArtifact` is canonical and document-scoped, with one current artifact per decision-room
   document. It is intentionally **unversioned** in Phase 9. `VisualPlan`, TipTap JSON, and
   `AgentBrief` are deterministic derived data, never competing sources of truth.
4. Existing raw-HTML documents remain `legacy` documents and continue through `DocumentSurface`.
   Migration must not invent a semantic artifact, move a legacy document into the decision-room
   router, or modify its HTML.
5. Mutations use explicit server-side commands inside a one-document transaction and optimistic
   concurrency. Clients never submit whole comments, verdicts, versions, or state collections.
6. Audit records material/security mutations only. Opening, reading, hovering, tab selection,
   time-on-page, presence, and agent-brief generation are never persisted as events.
7. Production Postgres schema changes are explicit migrations run before application deployment.
   No request path may run DDL, auto-create a table, or select JSON fallback in production.
8. The JSON adapter is for explicit local development and E2E only. It is not a lightweight
   production database and must be atomic at the file level.

## 1. Identity, scope, and authorization

### 1.1 Immutable identities

`Account.id` is a generated UUID and the sole foreign key/authorization subject. `username` is a
normalized, case-insensitive unique login/display field; it is not an identifier and may change
without invalidating memberships, comments, verdicts, or audit attribution. Account rows retain a
password hash only server-side. NextAuth session data exposes an account ID and safe display fields,
never the password hash, legacy raw token, or a global authorization role.

All imported legacy usernames are mapped once to account UUIDs using normalized usernames. A
case-insensitive collision, missing user, or invalid role creates a migration issue and blocks that
record from cutover; it is never guessed.

### 1.2 Membership rules

`workspace_members` represents workspace navigation. A workspace has exactly one owner account;
only that owner may create documents or manage workspace members in Phase 9. `room_members`
represents access to one document and has the closed enum:

```
viewer | commenter | collaborator | owner
```

Every new document gets an explicit owner room-membership for its creator. Invites are pending
records tied to a normalized invitee identity until an account accepts them; pre-account users do
not receive a usable room membership. Changing/removing membership is transactional, rejects
unknown roles, and preserves at least one room owner. Ownership changes use an explicit transfer
command, not a generic role patch.

### 1.3 Capability matrix

The server owns this exact matrix. Unknown/malformed roles deny every capability. The read response
returns the derived capability set only for client affordances; the client remains non-authoritative.

| Capability | viewer | commenter | collaborator | owner |
|---|---:|---:|---:|---:|
| `room.read`, `agent.ask` | yes | yes | yes | yes |
| `comment.create`, `comment.reply`, `verdict.set_self` | — | yes | yes | yes |
| `comment.resolve` / `comment.reopen` own authored thread | — | yes | yes | yes |
| `comment.resolve` / `comment.reopen` any thread | — | — | yes | yes |
| `room.edit`, `version.create`, `version.regenerate`, `source.lock` | — | — | yes | yes |
| `agent.export` | — | — | yes | yes |
| `version.publish`, `member.manage`, `room.archive`, `ownership.transfer` | — | — | — | yes |

There is no generic comment deletion in Phase 9. A verdict command writes only the caller's own
verdict, derives author/timestamps server-side, and cannot replace another person's verdict.
Workspace operations use the separate owner-only `workspace.create_document` and
`workspace.member_manage` capabilities.

`authorize(subject, resource, capability)` is server-only and always receives `{ accountId }`.
Every document-state, team, workspace, Ask, Export, edit, regenerate, import, and conversion route
uses it. On 401/403 or membership revocation, the client clears its cached room state rather than
continuing to show stale data.

## 2. Typed durable model

### 2.1 `DocumentStateV2` transport contract

Repository reads return a validated typed projection rather than the current loose state blob:

```ts
interface DocumentStateV2 {
  schemaVersion: 2;
  documentId: string;
  workspaceId: string;
  kind: "legacy" | "decision_room";
  revision: number;                 // monotonically increments for every command mutation
  title: string;
  activeVersionNumber: number;
  versions: DocumentVersionSnapshot[];
  comments: CommentThreadSnapshot[];
  verdicts: OwnableVerdictSnapshot[];
  semanticArtifact?: SemanticArtifact;
  visualPlan?: VisualPlan;
  capabilities: readonly Capability[];
}
```

`kind: "legacy"` requires no semantic artifact or visual plan. `kind: "decision_room"` requires a
schema-valid semantic artifact and a valid plan (or a plan deterministically regenerated before the
projection is returned). Request schemas contain only command inputs plus `expectedRevision`; all
actor, document, timestamp, version, ownership, resolution, and audit fields are server-derived.

### 2.2 Canonical rows and normalized Postgres schema

Use raw parameterized Postgres with explicit SQL migrations under `web/migrations/`. There is no ORM
requirement in this phase. The normalized tables are:

| Table | Purpose / essential invariants |
|---|---|
| `schema_migrations` | append-only migration ledger: ID, checksum, applied timestamp, application version |
| `accounts` | UUID PK; normalized unique username; server-only password hash; timestamps |
| `workspaces` | UUID PK; immutable owner account FK; name; timestamps |
| `workspace_members` | workspace/account composite uniqueness; navigation membership only |
| `workspace_invitations` | pending, expiring, account-required workspace invitations |
| `documents` | UUID PK; workspace FK; `kind`; title; active version; monotonic `revision`; archive metadata |
| `room_members` | document/account composite uniqueness; closed room-role enum |
| `room_invitations` | pending, expiring, account-required room invitations and intended role |
| `document_versions` | immutable numbered source snapshots, publish/lock metadata, creator/timestamps |
| `semantic_artifacts` | one current validated artifact per decision-room document (`UNIQUE(document_id)`) |
| `visual_plans` | one current validated deterministic plan per decision-room document |
| `comment_threads` | immutable author/target/creation fields; lifecycle and resolution fields; no client history blob |
| `comment_replies` | append-only replies keyed to a thread; immutable author/timestamp |
| `comment_history` | server-produced lifecycle/re-anchor history records for compatibility and traceability |
| `verdicts` | `UNIQUE(document_id, account_id)`; self-owned current verdict and timestamps |
| `agent_runs` | explicit user-initiated Ask/export metadata only; actor/document FK; no raw provider payload/secrets |
| `audit_events` | append-only material mutation audit stream, scoped to actor/document/workspace |
| `migration_issues` | source key/checksum, reason, structured safe details, status; blocks cutover until resolved |

Foreign keys and unique constraints enforce ownership/membership identity, per-document version
numbers, and one active verdict per account. JSONB is acceptable only for validated heterogeneous
payloads (source HTML snapshot, semantic JSON, visual plan JSON, target payload, and derived-cache
payload); it cannot substitute for a relationship table or authorization field.

### 2.3 Versions and derived caches

`document_versions` preserves current `vN` numbering/IDs, raw HTML/source content, version creator,
lock/publish metadata, and existing comment `versionId` references. It is the canonical history of
source/HTML edits. The semantic artifact does not get a parallel version history in Phase 9.

`tipTapDoc` and `AgentBrief` are optional, validated **derived caches** held in the associated
`document_versions.derived_cache` snapshot:

```ts
interface DerivedCacheSnapshot {
  semanticArtifactFingerprint: string; // SHA-256 canonical semantic JSON
  semanticSchemaVersion: 1;
  projectionSchemaVersion: 1;
  tipTapDoc?: TipTapVisualDoc;
  agentBrief?: AgentBrief;
}
```

This placement makes a cache's source/version context explicit without claiming it is canonical.
The cache is usable only when its fingerprint and schema versions exactly match the document's
current artifact; otherwise it is ignored, regenerated deterministically, and replaced only as
part of the next relevant command transaction. Artifact change invalidates both caches. A failed
cache validation never prevents rendering: rebuild the projection/brief from the validated artifact.

`visual_plans` receives the same artifact fingerprint and is regenerated when mismatched. It remains
an optimization/persisted plan, not a user-authored layout source.

## 3. Repository and command boundary

Persistence code is server-only under `web/src/server/persistence/`; routes and React components do
not import database helpers or know table/blob shape. Define typed `PersistenceRepository` methods
for account/session lookup, workspace/document listing, authorized room read, membership management,
and the commands below. The JSON and Postgres adapters implement the same interface; deterministic
unit tests target an in-memory/fake implementation first.

Every mutating method accepts `{ accountId, documentId, expectedRevision, ...validatedInput }`,
performs authorization and data change in one transaction/critical section, increments
`documents.revision` exactly once, writes an audit event when applicable, and returns a fresh
`DocumentStateV2`. A revision mismatch returns the stable `409 revision_conflict` response with the
current revision, never a best-effort merge. Reads include `revision`; commands use a mandatory
`expectedRevision` (or equivalent `If-Match: "rev-N"`, normalized into that field by the route).

Replace bulk `/api/collab` collection writes with narrow commands:

- `createComment`, `replyToComment`, `resolveComment`, `reopenComment`
- `setOwnVerdict`
- `createVersion`, `editVersion`, `regenerateVersion`, `publishVersion`, `lockSource`
- `createDocument`, `archiveRoom`, `inviteRoomMember`, `changeRoomRole`, `transferRoomOwnership`
- `recordAgentRun` after a user-initiated Ask or export succeeds

Routes validate allowlisted bodies before the repository call. Comments derive actor, creation time,
thread ownership, history, and allowed target from the server; replies and lifecycle changes cannot
forge a record or rewrite history. Ask remains permitted to all direct members, Export to
collaborator/owner. AgentBrief generation alone records nothing. A successful Ask creates an
`agent_runs` row and corresponding mutation audit record containing only safe model/preset/outcome
and artifact-fingerprint metadata—not prompt source text, answer prose, API keys, raw provider
payloads, or read/view telemetry. Export creates an audit event only; it is not an agent run.

## 4. Adapters and environment safety

### 4.1 Postgres

`DATABASE_URL` selects the Postgres adapter. Startup validates production configuration
(`DATABASE_URL`, `NEXTAUTH_SECRET`, SSL policy, and a completed migration ledger) but never runs
migrations. `npm run db:migrate` applies ordered, checksummed SQL files under a migration/advisory
lock. Migration application, staging rehearsal, backup marker, and production deployment are
operational steps, not HTTP requests.

All one-document mutations use a transaction with a document-row lock or revision-guarded update.
Cross-document operations are forbidden except explicit workspace/ownership commands whose
transaction boundaries are documented and tested.

### 4.2 JSON local/E2E adapter

The JSON adapter is selected only with an explicit absolute `COLLAB_JSON_DB_PATH` and
`NODE_ENV !== "production"`. Its path must be outside the checked-in `web/data/db.json`; that file
is read-only legacy/demo material and cannot be targeted. Writes use an in-process keyed mutex,
write a sibling temporary file, `fsync` as supported, then atomic rename. It validates the complete
`DocumentStateV2` projection before replacing the file. It is deliberately single-process; attempts
to use it in production, a relative path, an arbitrary repository path, or unsupported concurrent
mode fail closed.

## 5. Migration, compatibility, and rollback

### 5.1 Ordered cutover

1. Take a backup marker and apply schema migrations to a production-like staging database.
2. Run the non-HTTP `db:backfill --dry-run` tool against legacy `collab_state`; validate each legacy
   state as a source record and produce a manifest (counts, per-row content checksums, role/account
   mapping, legacy/decision-room classification, and migration issues).
3. Run committed backfill under an advisory lock. It is idempotent by source key + checksum and
   transactionally writes one document and its dependent rows at a time. Malformed/unmappable input
   writes a `migration_issues` record and no partial rows for that source document.
4. Run shadow parity reads. Counts/checksums and normalized projections must match; every legacy
   room must render through the legacy path. Any issue, mismatch, or unvalidated row blocks cutover.
5. Enable table-authoritative reads behind an explicit backend feature flag while mirroring every
   table mutation to the legacy blob during the defined canary/rollback window. Dual writes use the
   same validated command payload and record mirror failure as a hard operational alert.
6. A rollback switches reads back to the verified blob mirror; it never drops schema or deletes
   table data. Blob cleanup and table-only operation require a later owner retention decision after
   canary evidence.

There is no on-the-fly conversion of legacy HTML. A document without a valid semantic artifact
migrates as `kind: "legacy"`, retaining raw versions/comments/verdicts; it receives no semantic
artifact, visual plan, AgentBrief, decision-room tab, or agent route.

### 5.2 Legacy compatibility

Backfill preserves raw HTML exactly, existing version IDs/numbers, comment anchors/replies/history,
resolution metadata, verdict values, and timestamps where available. Unknown optional old fields use
documented safe defaults; unknown identities/roles do not. Existing anonymous/share-token state is
not migrated as an access grant: account acceptance and explicit direct membership are required.

## 6. E2E seed and test strategy

`E2E-001` replaces the removed reset endpoint with a direct script such as
`web/scripts/e2e/seed.ts`. It refuses to run unless all are true: `E2E_MODE=true`, non-production,
an absolute temporary `COLLAB_JSON_DB_PATH` under the test-output directory, and a path distinct
from `web/data/db.json`. It uses the real repository interface and password hashing to seed owner,
collaborator, commenter, and viewer accounts; one frozen semantic room; and one raw-HTML legacy
room. It writes a small generated-ID/credential manifest only in test output and uses serial
workers/atomic writes. For Postgres integration it accepts only a configured disposable database or
schema whose approved test prefix is verified before seed/truncate.

Browser tests authenticate through real credentials; normal coverage must not set `PLAYWRIGHT_TEST`
because that flag enables a test-session bypass. `MOCK_AI=true` remains appropriate for deterministic
conversion. Add E2E-002 import/render and legacy-surface checks, E2E-003 desktop stable-region
screenshot, E2E-004 375px screenshot/no-root-overflow plus keyboard tabs, and focused role/revocation
checks.

Required deterministic coverage includes:

- complete role × capability and unknown-role denial matrix; cross-workspace/document IDOR; 401/403
  and immediate revocation;
- command ownership (self verdict, authored-thread vs collaborator resolution), immutable reply and
  comment history, final-owner/ownership-transfer invariants, and document-create authority;
- legacy blob → V2 → adapter round trips for raw HTML, versions, anchors, replies, resolution,
  verdicts, sparse values, and no accidental semantic upgrade;
- immutable UUID mapping, normalized username collision rejection, repository transaction/revision
  conflict behavior, and cache fingerprint invalidation;
- mutation-only audit events and safe agent-run redaction; explicitly no events for reads/views/hover;
- JSON adapter production/path refusal and atomic local behavior; Postgres migration/backfill
  idempotency, issue handling, parity failure, dual-write mirror, and rollback read path.

Postgres-specific behavior runs only against an opt-in disposable test database/schema. Offline CI
remains deterministic through the fake/JSON adapter.

## 7. Phase gate and non-goals

Phase 9 exits only when all of the following are true:

1. Every `PERS-001..010` task is reviewed against this brief; app and web contracts compile.
2. `cd app && npm run typecheck && npm run build && npx vitest run` is green, followed by
   `cd web && npx tsc --noEmit && npm run build`.
3. The safe seed script and E2E-001..004 pass with real sign-in; anonymous requests receive 401;
   each room role sees only allowed controls and forbidden direct requests receive 403.
4. A production-like staging migration/backfill has zero-loss, checksum-clean parity, correctly
   renders legacy documents, and has no unresolved migration issues.
5. A staging rollback drill succeeds during the blob-mirror window. Production configuration proves
   Postgres, migrations, secret, SSL, and no JSON fallback; a controlled account-required canary
   verifies durable semantic/legacy rooms, membership revocation, comments/versions/verdicts,
   export headers, and a safe agent-run record.
6. No anonymous access, read surveillance, live collaboration, semantic artifact-versioning, or
   raw-HTML semantic migration is introduced.

Non-goals: richer invite UX, conversion progress/result polish, outcome-metric UI, new agent
personas/notifications, live co-editing, removal of the blob mirror, and destructive legacy cleanup.
Those belong to a later owner-approved phase (principally Phase 10).
