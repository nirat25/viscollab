import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentStateV2 } from "htmlcollab-app/persistence";
import { PostgresPersistenceRepository } from "./postgres";

const OWNER = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-07-20T00:00:00.000Z";

type SqlCall = { text: string; values: readonly unknown[] };

function legacyStateWithThread(): DocumentStateV2 {
  const timestamp = Date.parse(NOW);
  return {
    schemaVersion: 2,
    documentId: "doc-1",
    workspaceId: "workspace-1",
    kind: "legacy",
    revision: 0,
    title: "Room",
    activeVersionNumber: 1,
    versions: [{ id: "legacy-v1", versionNumber: 1, html: "<p>Room</p>", status: "Draft", createdAt: NOW, createdByAccountId: OWNER }],
    comments: [{
      id: "legacy-thread-1",
      versionId: "legacy-v1",
      author: OWNER,
      body: "Initial comment",
      createdAt: timestamp,
      feedbackType: "question",
      lifecycle: "resolved",
      anchorStatus: "anchored",
      target: { type: "element", id: "summary", path: "main > p", hash: 1, tag: "p", snippet: "Room" },
      posStart: 3,
      posEnd: 7,
      lastKnownContext: "Room",
      resolution: { resolvedBy: OWNER, resolvedAt: timestamp + 2, resolvedInVersion: 1, changeLink: { before: "v1", after: "v1" } },
      replies: [
        { id: "legacy-reply-1", author: OWNER, body: "First reply", mentions: [], ts: timestamp },
        { id: "legacy-reply-2", author: OWNER, body: "Second reply", mentions: [], ts: timestamp + 1 },
      ],
      mentions: [],
      history: [
        { event: "created", who: OWNER, when: timestamp },
        { event: "replied", who: OWNER, when: timestamp + 1 },
      ],
    }],
    verdicts: [{ accountId: OWNER, verdict: null, updatedAt: NOW }],
    capabilities: [],
  };
}

test("normalized projection upserts durable rows without replacing immutable relationships", async () => {
  const calls: SqlCall[] = [];
  const query = async (text: string, values: readonly unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
    calls.push({ text, values });
    if (text.includes("INSERT INTO document_versions")) return { rows: [{ id: "database-version-1" }] };
    if (text.includes("INSERT INTO comment_threads")) return { rows: [{ id: "database-thread-1" }] };
    if (text.includes("INSERT INTO comment_replies") || text.includes("INSERT INTO comment_history")) return { rows: [{ id: "immutable-child" }] };
    if (text.includes("SELECT id::text FROM accounts")) return { rows: [{ id: OWNER }] };
    return { rows: [] };
  };
  const repository = new PostgresPersistenceRepository({ query, async connect() { throw new Error("not used"); } } as never, []);
  const projectionWriter = repository as unknown as {
    replaceProjection(database: { query: typeof query }, state: DocumentStateV2): Promise<void>;
  };

  await projectionWriter.replaceProjection({ query }, legacyStateWithThread());

  assert.equal(calls.filter(({ text }) => /DELETE FROM (?:document_versions|comment_threads|comment_replies|comment_history)/.test(text)).length, 0);

  const version = calls.find(({ text }) => text.includes("INSERT INTO document_versions"));
  assert.ok(version);
  assert.equal(version.values[1], "legacy-v1");
  assert.match(version.text, /ON CONFLICT \(document_id, version_number\) DO UPDATE/);
  assert.doesNotMatch(version.text.slice(version.text.indexOf("DO UPDATE")), /created_by_account_id|created_at|legacy_version_id/);

  const thread = calls.find(({ text }) => text.includes("INSERT INTO comment_threads"));
  assert.ok(thread);
  assert.equal(thread.values[0], "legacy-thread-1");
  assert.equal(thread.values[2], "database-version-1", "comment reuses the existing version row identity");
  assert.match(thread.text, /ON CONFLICT \(document_id, legacy_thread_id\) DO UPDATE/);
  const mutableThreadFields = thread.text.slice(thread.text.indexOf("DO UPDATE"));
  assert.match(mutableThreadFields, /'\{resolution\}'/);
  assert.match(mutableThreadFields, /'\{posStart\}'/);
  assert.match(mutableThreadFields, /'\{posEnd\}'/);
  assert.match(mutableThreadFields, /'\{lastKnownContext\}'/);
  assert.match(mutableThreadFields, /WHERE comment_threads\.version_id = EXCLUDED\.version_id/);
  assert.match(mutableThreadFields, /comment_threads\.target_payload -> 'target' IS NOT DISTINCT FROM EXCLUDED\.target_payload -> 'target'/);
  assert.doesNotMatch(mutableThreadFields.slice(0, mutableThreadFields.indexOf("WHERE")), /version_id|author_account_id|body|created_at|target_payload = EXCLUDED/);

  const replies = calls.filter(({ text }) => text.includes("INSERT INTO comment_replies"));
  assert.equal(replies.length, 2);
  assert.deepEqual(replies.map(({ values }) => values[0]), ["legacy-reply-1", "legacy-reply-2"]);
  assert.deepEqual(replies.map(({ values }) => values[1]), ["database-thread-1", "database-thread-1"]);
  assert.deepEqual(replies.map(({ values }) => values[4]), [0, 1]);
  assert.ok(replies.every(({ text }) => text.includes("legacy_sequence") && text.includes("ON CONFLICT (thread_id, legacy_reply_id) DO UPDATE") && text.includes("RETURNING id::text")));

  const history = calls.filter(({ text }) => text.includes("INSERT INTO comment_history"));
  assert.equal(history.length, 2);
  assert.deepEqual(history.map(({ values }) => values[0]), ["database-thread-1", "database-thread-1"]);
  assert.deepEqual(history.map(({ values }) => values[4]), [0, 1]);
  assert.ok(history.every(({ text }) => text.includes("legacy_sequence") && text.includes("ON CONFLICT (thread_id, legacy_sequence) DO UPDATE") && text.includes("RETURNING id::text")));

  const clearedVerdict = calls.find(({ text }) => text.includes("DELETE FROM verdicts"));
  assert.ok(clearedVerdict);
  assert.deepEqual(clearedVerdict.values, ["doc-1", OWNER]);
});

test("account creation persists supplied immutable timestamps with a self-contained password hash", async () => {
  const calls: SqlCall[] = [];
  const passwordHash = "scrypt-v1$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$" + "b".repeat(128);
  const query = async (text: string, values: readonly unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
    calls.push({ text, values });
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK" || text.includes("INSERT INTO collab_state")) return { rows: [] };
    if (text.includes("FROM persistence_cutover_state")) return { rows: [{ read_mode: "table", dual_write_enabled: true, last_parity_verified_at: NOW, parity_is_clean: true }] };
    if (text.includes("INSERT INTO accounts")) return { rows: [{ id: OWNER, username: "Owner", username_normalized: "owner", password_hash: passwordHash, password_salt: "", created_at: NOW, updated_at: NOW }] };
    if (text.includes("SELECT username, password_hash, password_salt FROM accounts")) return { rows: [{ username: "Owner", password_hash: passwordHash, password_salt: "" }] };
    throw new Error(`unexpected SQL: ${text}`);
  };
  const client = { query, release() {} };
  const repository = new PostgresPersistenceRepository({ query, async connect() { return client; } } as never, []);

  const account = await repository.createAccount({ id: OWNER, username: "Owner", normalizedUsername: "owner", passwordHash, createdAt: NOW, updatedAt: NOW });

  assert.equal(account.passwordHash, passwordHash);
  const insert = calls.find(({ text }) => text.includes("INSERT INTO accounts"));
  assert.ok(insert);
  assert.deepEqual(insert.values, [OWNER, "Owner", "owner", passwordHash, "", NOW, NOW]);
  assert.match(insert.text, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7\)/);
});
