import assert from "node:assert/strict";
import test from "node:test";
import { legacyMirrorChecksum } from "./cutover";
import { PostgresPersistenceRepository } from "./postgres";

const OWNER = "11111111-1111-4111-8111-111111111111";
const COMMENTER = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-07-20T00:00:00.000Z";

test("a legacy-mirror write failure rolls the whole normalized command back", async () => {
  const calls: string[] = [];
  const query = async (text: string): Promise<{ rows: Array<Record<string, unknown>> }> => {
    calls.push(text);
    if (text === "BEGIN" || text === "ROLLBACK" || text.startsWith("DELETE FROM") || text.startsWith("INSERT INTO collab_state")) return { rows: [] };
    if (text.includes("FROM persistence_cutover_state")) return { rows: [{ read_mode: "table", dual_write_enabled: true, last_parity_verified_at: NOW, parity_is_clean: true }] };
    if (text.includes("FROM documents WHERE id = $1 FOR UPDATE")) return { rows: [{ id: "doc-1", workspace_id: "workspace-1", kind: "legacy", revision: 0, title: "Before", active_version_number: 1 }] };
    if (text.includes("FROM document_versions")) return { rows: [{ database_id: "db-v1", id: "v1", version_number: 1, source_html: "<p>exact</p>", status: "Draft", created_at: NOW, created_by_account_id: OWNER, published_at: null, published_by_account_id: null, source_locked_at: null, source_locked_by_account_id: null, derived_cache: null }] };
    if (text.includes("FROM semantic_artifacts") || text.includes("FROM visual_plans") || text.includes("FROM comment_threads") || text.includes("FROM comment_replies") || text.includes("FROM comment_history") || text.includes("FROM verdicts")) return { rows: [] };
    if (text.includes("SELECT role::text FROM room_members")) return { rows: [{ role: "owner" }] };
    if (text.includes("UPDATE documents SET title")) return { rows: [{ revision: 1 }] };
    if (text.includes("INSERT INTO document_versions")) return { rows: [{ id: "db-v1-new" }] };
    if (text.includes("SELECT source_key FROM migration_sources")) return { rows: [{ source_key: "legacy:document:legacy-doc-1" }] };
    if (text.includes("FROM documents d JOIN workspaces")) return { rows: [{ legacy_source_key: "legacy:workspace:legacy-workspace-1" }] };
    if (text.includes("FROM room_members rm JOIN accounts")) return { rows: [{ account_id: OWNER, role: "owner", username: "Owner" }] };
    if (text.includes("SELECT id::text, username FROM accounts")) return { rows: [{ id: OWNER, username: "Owner" }] };
    if (text.includes("FROM room_invitations WHERE document_id")) return { rows: [] };
    if (text.includes("FROM collab_state WHERE key = 'documents'")) return { rows: [{ value: [{ id: "legacy-doc-1", workspaceId: "legacy-workspace-1", name: "Before", members: [{ username: "Owner", role: "owner" }] }] }] };
    if (text.includes("INSERT INTO legacy_blob_mirror_receipts")) throw new Error("legacy blob write unavailable");
    throw new Error(`unexpected SQL: ${text}`);
  };
  const client = { query, release() {} };
  const pool = { query, async connect() { return client; } };
  const repository = new PostgresPersistenceRepository(pool as never, []);

  await assert.rejects(
    repository.runDocumentCommand(
      { accountId: OWNER, documentId: "doc-1", expectedRevision: 0 },
      (state) => ({ state: { ...state, title: "After" }, value: null }),
    ),
    /legacy blob write unavailable/,
  );
  assert.ok(calls.includes("ROLLBACK"));
  assert.ok(!calls.includes("COMMIT"));
  assert.ok(calls.some((call) => call.includes("INSERT INTO legacy_blob_mirror_receipts")));
});

test("blob rollback reads reject an unverified mirror instead of falling back to normalized rows", async () => {
  const query = async (text: string): Promise<{ rows: Array<Record<string, unknown>> }> => {
    if (text.includes("SELECT role::text FROM room_members")) return { rows: [{ role: "viewer" }] };
    if (text.includes("FROM persistence_cutover_state")) return { rows: [{ read_mode: "blob", dual_write_enabled: true, last_parity_verified_at: null, parity_is_clean: false }] };
    if (text.includes("SELECT id::text, workspace_id::text, revision, title")) return { rows: [{ id: "doc-1", workspace_id: "workspace-1", revision: 4, title: "Room" }] };
    if (text.includes("FROM migration_sources ms JOIN legacy_blob_mirror_receipts")) return { rows: [{ source_key: "legacy:document:legacy-doc-1", document_revision: 4, blob_checksum: "0".repeat(64) }] };
    if (text.includes("WHERE key = 'documents'")) return { rows: [{ value: [{ id: "legacy-doc-1", workspaceId: "legacy-workspace-1" }] }] };
    if (text.includes("WHERE key = $1")) return { rows: [{ value: { versions: [{ id: "v1", versionNumber: 1, html: "<p>unverified</p>", status: "Draft", timestamp: NOW }] } }] };
    throw new Error(`unexpected SQL: ${text}`);
  };
  const pool = { query, async connect() { throw new Error("not used"); } };
  const repository = new PostgresPersistenceRepository(pool as never, []);
  await assert.rejects(repository.readRoom(OWNER, "doc-1"), /checksum mismatch/);
});

test("workspace creation mirrors the legacy workspace catalog and audits before commit", async () => {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const query = async (text: string, values: readonly unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
    calls.push({ text, values });
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK" || text.startsWith("INSERT INTO workspaces")
      || text.startsWith("INSERT INTO workspace_members") || text.includes("INSERT INTO collab_state") || text.includes("INSERT INTO audit_events")) return { rows: [] };
    if (text.includes("FROM persistence_cutover_state")) return { rows: [{ read_mode: "table", dual_write_enabled: true, last_parity_verified_at: NOW, parity_is_clean: true }] };
    if (text.includes("SELECT id::text FROM accounts")) return { rows: [{ id: OWNER }] };
    if (text.includes("FROM workspaces w JOIN accounts owner")) return { rows: [{ id: "workspace-1", legacy_source_key: null, name: "Strategy", owner_username: "Owner" }] };
    if (text.includes("FROM workspace_members wm JOIN accounts")) return { rows: [{ workspace_id: "workspace-1", username: "Owner", role: "owner" }] };
    if (text.includes("FROM workspace_invitations ORDER BY")) return { rows: [] };
    throw new Error(`unexpected SQL: ${text}`);
  };
  const client = { query, release() {} };
  const repository = new PostgresPersistenceRepository({ query, async connect() { return client; } } as never, []);
  await repository.createWorkspace({
    accountId: OWNER,
    workspace: { id: "workspace-1", name: "Strategy", ownerAccountId: OWNER, createdAt: NOW, updatedAt: NOW },
    ownerMembership: { workspaceId: "workspace-1", accountId: OWNER, role: "owner", createdAt: NOW },
  });
  const mirror = calls.find(({ text }) => text.includes("INSERT INTO collab_state") && text.includes("'workspaces'"));
  assert.ok(mirror);
  assert.deepEqual(JSON.parse(String(mirror.values[0])), [{ id: "workspace-1", normalizedId: "workspace-1", name: "Strategy", createdBy: "Owner", members: [{ username: "Owner", role: "owner" }], invitations: [] }]);
  const audit = calls.find(({ text }) => text.includes("INSERT INTO audit_events"));
  assert.ok(audit);
  assert.equal(audit.values[4], "workspace.created");
  assert.ok(calls.findIndex(({ text }) => text.includes("INSERT INTO collab_state")) < calls.findIndex(({ text }) => text === "COMMIT"));
  assert.ok(calls.findIndex(({ text }) => text.includes("INSERT INTO audit_events")) < calls.findIndex(({ text }) => text === "COMMIT"));
});

test("a verified blob rollback read restores immutable review ownership and source locks", async () => {
  const document = { id: "legacy-doc-1", workspaceId: "legacy-workspace-1", name: "Room" };
  const state = {
    activeVersionNum: 1,
    versions: [{ id: "v1", versionNumber: 1, html: "<p>exact</p>", status: "Published", timestamp: NOW, createdBy: "Owner", publishedBy: "Owner", sourceLockedAt: NOW, sourceLockedBy: "Owner" }],
    comments: [{ id: "c1", versionId: "v1", author: "Commenter", body: "Question", createdAt: 1, feedbackType: "question", lifecycle: "resolved", anchorStatus: "anchored", target: { type: "text", quote: "exact", prefix: "", suffix: "" }, posStart: 2, posEnd: 7, lastKnownContext: "exact", resolution: { resolvedBy: "Owner", resolvedAt: 2 }, replies: [{ id: "r1", author: "Owner", body: "Reply", mentions: [], ts: 3 }], mentions: [], history: [{ event: "resolved", who: "Owner", when: 2 }] }],
    verdicts: { Commenter: "changes" },
  };
  const checksum = legacyMirrorChecksum(document, state);
  const query = async (text: string): Promise<{ rows: Array<Record<string, unknown>> }> => {
    if (text.includes("SELECT role::text FROM room_members")) return { rows: [{ role: "commenter" }] };
    if (text.includes("FROM persistence_cutover_state")) return { rows: [{ read_mode: "blob", dual_write_enabled: true, last_parity_verified_at: null, parity_is_clean: false }] };
    if (text.includes("SELECT id::text, workspace_id::text, revision, title")) return { rows: [{ id: "doc-1", workspace_id: "workspace-1", revision: 4, title: "Room" }] };
    if (text.includes("FROM migration_sources ms JOIN legacy_blob_mirror_receipts")) return { rows: [{ source_key: "legacy:document:legacy-doc-1", document_revision: 4, blob_checksum: checksum }] };
    if (text.includes("WHERE key = 'documents'")) return { rows: [{ value: [document] }] };
    if (text.includes("FROM collab_state WHERE key = $1")) return { rows: [{ value: state }] };
    if (text.includes("SELECT id::text, username_normalized FROM accounts")) return { rows: [{ id: OWNER, username_normalized: "owner" }, { id: COMMENTER, username_normalized: "commenter" }] };
    if (text.includes("SELECT account_id::text FROM room_members")) return { rows: [{ account_id: OWNER }] };
    throw new Error(`unexpected SQL: ${text}`);
  };
  const repository = new PostgresPersistenceRepository({ query, async connect() { throw new Error("not used"); } } as never, []);
  const room = await repository.readRoom(COMMENTER, "doc-1");
  assert.equal(room?.state.comments[0]?.author, COMMENTER);
  assert.equal(room?.state.comments[0]?.resolution?.resolvedBy, OWNER);
  assert.equal(room?.state.comments[0]?.posStart, 2);
  assert.equal(room?.state.comments[0]?.posEnd, 7);
  assert.equal(room?.state.verdicts[0]?.accountId, COMMENTER);
  assert.deepEqual(room?.state.versions[0], {
    id: "v1", versionNumber: 1, html: "<p>exact</p>", status: "Live", createdAt: NOW,
    createdByAccountId: OWNER, publishedAt: NOW, publishedByAccountId: OWNER, lockedAt: NOW, lockedByAccountId: OWNER,
  });
});
