import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentStateV2 } from "htmlcollab-app/persistence";
import { PersistenceCommandService, CommandAuthorizationError, CommandStateError } from "./commands";
import { InMemoryPersistenceRepository } from "./fake";
import type { PersistedSnapshot } from "./repository";

const NOW = "2026-07-20T12:00:00.000Z";
const OWNER = "00000000-0000-4000-8000-000000000001";
const COLLABORATOR = "00000000-0000-4000-8000-000000000002";
const COMMENTER = "00000000-0000-4000-8000-000000000003";
const VIEWER = "00000000-0000-4000-8000-000000000004";
const OUTSIDER = "00000000-0000-4000-8000-000000000005";
const WORKSPACE = "00000000-0000-4000-8000-000000000010";
const DOCUMENT = "00000000-0000-4000-8000-000000000020";

function fixture(): PersistedSnapshot {
  const accounts = [OWNER, COLLABORATOR, COMMENTER, VIEWER, OUTSIDER].map((id, index) => ({
    id, username: `User${index}`, normalizedUsername: `user${index}`, passwordHash: "hash", createdAt: NOW, updatedAt: NOW,
  }));
  const state: DocumentStateV2 = {
    schemaVersion: 2, documentId: DOCUMENT, workspaceId: WORKSPACE, kind: "legacy", revision: 0,
    title: "Room", activeVersionNumber: 1,
    versions: [{ id: "v1", versionNumber: 1, html: "<p>Source</p>", status: "Draft", createdAt: NOW }],
    comments: [], verdicts: [], capabilities: [],
  };
  return {
    accounts,
    workspaces: [{ id: WORKSPACE, name: "Workspace", ownerAccountId: OWNER, createdAt: NOW, updatedAt: NOW }],
    workspaceMemberships: [
      { workspaceId: WORKSPACE, accountId: OWNER, role: "owner", createdAt: NOW },
      { workspaceId: WORKSPACE, accountId: OUTSIDER, role: "member", createdAt: NOW },
    ],
    roomMemberships: [
      { documentId: DOCUMENT, accountId: OWNER, role: "owner", createdAt: NOW },
      { documentId: DOCUMENT, accountId: COLLABORATOR, role: "collaborator", createdAt: NOW },
      { documentId: DOCUMENT, accountId: COMMENTER, role: "commenter", createdAt: NOW },
      { documentId: DOCUMENT, accountId: VIEWER, role: "viewer", createdAt: NOW },
    ],
    documents: [state], roomInvitations: [], documentMetadata: [], auditEvents: [], agentRuns: [],
  };
}

function harness() {
  let sequence = 0;
  const repository = new InMemoryPersistenceRepository(fixture());
  const service = new PersistenceCommandService(repository, {
    now: () => new Date(NOW),
    id: () => `generated-${++sequence}`,
  });
  return { repository, service };
}

const textTarget = { type: "text" as const, quote: "Source", prefix: "", suffix: "" };

test("viewer is read/Ask-only while commenter can create and manage only an authored thread", async () => {
  const { service } = harness();
  await assert.rejects(service.createComment({ accountId: VIEWER, documentId: DOCUMENT, expectedRevision: 0, body: "No", target: textTarget }), CommandAuthorizationError);

  const created = await service.createComment({ accountId: COMMENTER, documentId: DOCUMENT, expectedRevision: 0, body: "Question", target: textTarget });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.value.author, COMMENTER);
  assert.equal(created.state.revision, 1);

  await assert.rejects(service.resolveComment({ accountId: VIEWER, documentId: DOCUMENT, expectedRevision: 1, threadId: created.value.id }), CommandAuthorizationError);
  const resolved = await service.resolveComment({ accountId: COMMENTER, documentId: DOCUMENT, expectedRevision: 1, threadId: created.value.id });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.value.resolution?.resolvedBy, COMMENTER);

  const second = await service.createComment({ accountId: COLLABORATOR, documentId: DOCUMENT, expectedRevision: 2, body: "Flag", target: textTarget });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  await assert.rejects(service.resolveComment({ accountId: COMMENTER, documentId: DOCUMENT, expectedRevision: 3, threadId: second.value.id }), CommandAuthorizationError);
  const anyThread = await service.resolveComment({ accountId: COLLABORATOR, documentId: DOCUMENT, expectedRevision: 3, threadId: second.value.id });
  assert.equal(anyThread.ok, true);
});

test("revision conflicts are stable and create no audit side effect", async () => {
  const { repository, service } = harness();
  const first = await service.setOwnVerdict({ accountId: COMMENTER, documentId: DOCUMENT, expectedRevision: 0, verdict: "approve" });
  assert.equal(first.ok, true);
  const stale = await service.setOwnVerdict({ accountId: COMMENTER, documentId: DOCUMENT, expectedRevision: 0, verdict: "block" });
  assert.deepEqual(stale, { ok: false, status: 409, code: "revision_conflict", currentRevision: 1 });
  const snapshot = await repository.inspectSnapshot();
  assert.equal(snapshot.auditEvents?.length, 1);
  assert.deepEqual(snapshot.documents[0]!.verdicts, [{ accountId: COMMENTER, verdict: "approve", updatedAt: NOW }]);
});

test("membership commands preserve owner invariants and authority changes immediately", async () => {
  const { repository, service } = harness();
  await assert.rejects(service.changeRoomRole({ accountId: OWNER, documentId: DOCUMENT, expectedRevision: 0, targetAccountId: OWNER, role: "viewer" }), CommandStateError);
  await assert.rejects(service.removeRoomMember({ accountId: OWNER, documentId: DOCUMENT, expectedRevision: 0, targetAccountId: OWNER }), CommandStateError);

  const transferred = await service.transferRoomOwnership({ accountId: OWNER, documentId: DOCUMENT, expectedRevision: 0, targetAccountId: COLLABORATOR });
  assert.equal(transferred.ok, true);
  assert.equal(await repository.getRoomRole(OWNER, DOCUMENT), "collaborator");
  assert.equal(await repository.getRoomRole(COLLABORATOR, DOCUMENT), "owner");
  await assert.rejects(service.changeRoomRole({ accountId: OWNER, documentId: DOCUMENT, expectedRevision: 1, targetAccountId: COMMENTER, role: "viewer" }), CommandAuthorizationError);
});

test("Ask stores only redacted success metadata and Export creates audit only", async () => {
  const { repository, service } = harness();
  const ask = await service.recordSuccessfulAsk({
    accountId: VIEWER, documentId: DOCUMENT, expectedRevision: 0, model: "safe-model", preset: "skeptic",
    semanticArtifactFingerprint: "a".repeat(64),
    ...({ prompt: "SECRET PROMPT", answer: "SECRET ANSWER", rawProviderPayload: "SECRET RAW" } as object),
  });
  assert.equal(ask.ok, true);
  const exported = await service.recordSuccessfulExport({ accountId: COLLABORATOR, documentId: DOCUMENT, expectedRevision: 1 });
  assert.equal(exported.ok, true);
  const snapshot = await repository.inspectSnapshot();
  assert.equal(snapshot.agentRuns?.length, 1);
  assert.equal(snapshot.auditEvents?.length, 2);
  const serialized = JSON.stringify({ agentRuns: snapshot.agentRuns, auditEvents: snapshot.auditEvents });
  assert.doesNotMatch(serialized, /SECRET|prompt|answer|rawProviderPayload/i);
});

test("reads create no audit and direct room membership—not workspace membership—authorizes room access", async () => {
  const { repository } = harness();
  assert.equal(await repository.readRoom(OUTSIDER, DOCUMENT), null);
  assert.ok(await repository.readRoom(VIEWER, DOCUMENT));
  await repository.listDocuments(VIEWER, WORKSPACE);
  await repository.listWorkspaces(OWNER);
  assert.deepEqual((await repository.inspectSnapshot()).auditEvents, []);
});

test("only the workspace owner can create a document and creator receives direct owner membership", async () => {
  const { repository, service } = harness();
  await assert.rejects(service.createDocument({ accountId: OUTSIDER, workspaceId: WORKSPACE, title: "Denied", html: "<p>x</p>" }));
  const created = await service.createDocument({ accountId: OWNER, workspaceId: WORKSPACE, title: "Created", html: "<p>x</p>" });
  assert.equal(created.revision, 0);
  assert.equal(await repository.getRoomRole(OWNER, created.documentId), "owner");
  const snapshot = await repository.inspectSnapshot();
  assert.equal(snapshot.auditEvents?.at(-1)?.type, "document.created");
});

test("archive and version capabilities are server-enforced", async () => {
  const { service } = harness();
  await assert.rejects(service.createVersion({ accountId: COMMENTER, documentId: DOCUMENT, expectedRevision: 0, html: "<p>v2</p>" }), CommandAuthorizationError);
  const version = await service.createVersion({ accountId: COLLABORATOR, documentId: DOCUMENT, expectedRevision: 0, html: "<p>v2</p>" });
  assert.equal(version.ok, true);
  await assert.rejects(service.publishVersion({ accountId: COLLABORATOR, documentId: DOCUMENT, expectedRevision: 1, versionNumber: 2 }), CommandAuthorizationError);
  const published = await service.publishVersion({ accountId: OWNER, documentId: DOCUMENT, expectedRevision: 1, versionNumber: 2 });
  assert.equal(published.ok, true);
  const archived = await service.archiveRoom({ accountId: OWNER, documentId: DOCUMENT, expectedRevision: 2 });
  assert.equal(archived.ok, true);
  await assert.rejects(service.setOwnVerdict({ accountId: COMMENTER, documentId: DOCUMENT, expectedRevision: 3, verdict: "approve" }), CommandStateError);
});
