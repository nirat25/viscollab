import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { DocumentStateV2 } from "htmlcollab-app/persistence";
import { InMemoryPersistenceRepository } from "./fake";
import { JsonPersistenceRepository } from "./json";
import {
  DocumentNotFoundError,
  PersistenceValidationError,
  RoomAccessDeniedError,
  type PersistedSnapshot,
} from "./repository";

const NOW = "2026-07-20T00:00:00.000Z";
const OWNER_ID = "11111111-1111-4111-8111-111111111111";

function snapshot(): PersistedSnapshot {
  return {
    accounts: [{ id: OWNER_ID, username: "Owner", normalizedUsername: "owner", passwordHash: "hash", createdAt: NOW, updatedAt: NOW }],
    workspaces: [{ id: "workspace-1", name: "Workspace", ownerAccountId: OWNER_ID, createdAt: NOW, updatedAt: NOW }],
    workspaceMemberships: [{ workspaceId: "workspace-1", accountId: OWNER_ID, role: "owner", createdAt: NOW }],
    roomMemberships: [{ documentId: "document-1", accountId: OWNER_ID, role: "owner", createdAt: NOW }],
    documents: [{
      schemaVersion: 2, documentId: "document-1", workspaceId: "workspace-1", kind: "legacy", revision: 0,
      title: "Legacy", activeVersionNumber: 1,
      versions: [{ id: "v1", versionNumber: 1, html: "<p>legacy</p>", status: "Draft", createdAt: NOW }],
      comments: [], verdicts: [], capabilities: [],
    }],
  };
}

test("repository seed rejects a workspace whose declared owner lacks owner membership", () => {
  const invalid = snapshot();
  invalid.workspaceMemberships = [];
  assert.throws(() => new InMemoryPersistenceRepository(invalid), PersistenceValidationError);
});

test("repository seed rejects a document without a room owner", () => {
  const invalid = snapshot();
  invalid.roomMemberships = [{ ...invalid.roomMemberships[0]!, role: "viewer" }];
  assert.throws(() => new InMemoryPersistenceRepository(invalid), PersistenceValidationError);
});

test("account registration and workspace navigation retain immutable account authority", async () => {
  const repo = new InMemoryPersistenceRepository();
  const account = { id: OWNER_ID, username: "Owner", normalizedUsername: "owner", passwordHash: "scrypt-v1$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$" + "b".repeat(128), createdAt: NOW, updatedAt: NOW };
  await repo.createAccount(account);
  assert.deepEqual(await repo.getSessionIdentity(OWNER_ID), { accountId: OWNER_ID, username: "Owner" });
  const workspace = { id: "workspace-2", name: "Created", ownerAccountId: OWNER_ID, createdAt: NOW, updatedAt: NOW };
  await repo.createWorkspace({ accountId: OWNER_ID, workspace, ownerMembership: { workspaceId: workspace.id, accountId: OWNER_ID, role: "owner", createdAt: NOW } });
  assert.deepEqual(await repo.listWorkspaces(OWNER_ID), [workspace]);
  assert.deepEqual(await repo.listDocuments(OWNER_ID, workspace.id), []);
});

test("workspace membership does not imply room membership", async () => {
  const repo = new InMemoryPersistenceRepository(snapshot());
  const visitor = "22222222-2222-4222-8222-222222222222";
  await repo.createAccount({ id: visitor, username: "Visitor", normalizedUsername: "visitor", passwordHash: "scrypt-v1$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$" + "b".repeat(128), createdAt: NOW, updatedAt: NOW });
  await repo.addWorkspaceMember({ accountId: OWNER_ID, workspaceId: "workspace-1", targetAccountId: visitor, role: "member" });
  assert.deepEqual(await repo.listDocuments(visitor, "workspace-1"), []);
  assert.equal(await repo.readRoom(visitor, "document-1"), null);
});

test("pending workspace invitations grant navigation only on matching authenticated acceptance", async () => {
  const repo = new InMemoryPersistenceRepository(snapshot());
  const invitee = "22222222-2222-4222-8222-222222222222";
  await repo.createAccount({ id: invitee, username: "Invitee", normalizedUsername: "invitee", passwordHash: "hash", createdAt: NOW, updatedAt: NOW });
  const invitation = { id: "workspace-invite-1", workspaceId: "workspace-1", normalizedUsername: "invitee", role: "member" as const, invitedByAccountId: OWNER_ID, createdAt: NOW, expiresAt: "2027-07-20T12:00:00.000Z" };
  await repo.createWorkspaceInvitation({ accountId: OWNER_ID, workspaceId: "workspace-1", invitation });
  assert.deepEqual(await repo.listWorkspaces(invitee), []);
  await repo.acceptWorkspaceInvitation({ accountId: invitee, workspaceId: "workspace-1", invitationId: invitation.id });
  assert.equal((await repo.listWorkspaces(invitee))[0]?.id, "workspace-1");
  assert.deepEqual(await repo.listDocuments(invitee, "workspace-1"), []);
});

test("pending room invitations create direct room membership only for the matching account and revision", async () => {
  const repo = new InMemoryPersistenceRepository(snapshot());
  const invitee = "22222222-2222-4222-8222-222222222222";
  await repo.createAccount({ id: invitee, username: "Invitee", normalizedUsername: "invitee", passwordHash: "hash", createdAt: NOW, updatedAt: NOW });
  const source = await repo.inspectSnapshot();
  await repo.seed({ ...source, roomInvitations: [{ id: "room-invite-1", documentId: "document-1", normalizedUsername: "invitee", role: "viewer", invitedByAccountId: OWNER_ID, createdAt: NOW, expiresAt: "2027-07-20T12:00:00.000Z" }] });
  const accepted = await repo.acceptRoomInvitation({ accountId: invitee, documentId: "document-1", invitationId: "room-invite-1", expectedRevision: 0 });
  assert.equal(accepted.ok, true);
  assert.equal(await repo.getRoomRole(invitee, "document-1"), "viewer");
  assert.equal((await repo.inspectSnapshot()).auditEvents?.at(-1)?.type, "member.invitation_accepted");
});

test("owners can revoke pending invitations and revoked invitations cannot be accepted", async () => {
  const repo = new InMemoryPersistenceRepository(snapshot());
  const invitee = "22222222-2222-4222-8222-222222222222";
  await repo.createAccount({ id: invitee, username: "Invitee", normalizedUsername: "invitee", passwordHash: "hash", createdAt: NOW, updatedAt: NOW });
  const source = await repo.inspectSnapshot();
  await repo.seed({ ...source, workspaceInvitations: [{ id: "workspace-revoke", workspaceId: "workspace-1", normalizedUsername: "invitee", role: "member", invitedByAccountId: OWNER_ID, createdAt: NOW, expiresAt: "2027-07-20T12:00:00.000Z" }], roomInvitations: [{ id: "room-revoke", documentId: "document-1", normalizedUsername: "invitee", role: "viewer", invitedByAccountId: OWNER_ID, createdAt: NOW, expiresAt: "2027-07-20T12:00:00.000Z" }] });
  await repo.revokeWorkspaceInvitation({ accountId: OWNER_ID, workspaceId: "workspace-1", invitationId: "workspace-revoke" });
  await assert.rejects(repo.acceptWorkspaceInvitation({ accountId: invitee, workspaceId: "workspace-1", invitationId: "workspace-revoke" }));
  const revoked = await repo.revokeRoomInvitation({ accountId: OWNER_ID, documentId: "document-1", invitationId: "room-revoke", expectedRevision: 0 });
  assert.equal(revoked.ok, true);
  await assert.rejects(repo.acceptRoomInvitation({ accountId: invitee, documentId: "document-1", invitationId: "room-revoke", expectedRevision: 1 }));
});

test("command errors distinguish missing documents from direct-membership denial", async () => {
  const repo = new InMemoryPersistenceRepository(snapshot());
  const mutate = (state: DocumentStateV2) => ({ state: { ...state }, value: null });
  await assert.rejects(repo.runDocumentCommand({ accountId: OWNER_ID, documentId: "missing", expectedRevision: 0 }, mutate), DocumentNotFoundError);
  await assert.rejects(repo.runDocumentCommand({ accountId: "22222222-2222-4222-8222-222222222222", documentId: "document-1", expectedRevision: 0 }, mutate), RoomAccessDeniedError);
});

test("JSON adapter refuses unsafe paths and writes revisioned snapshots atomically", async () => {
  assert.throws(() => new JsonPersistenceRepository({ filePath: "relative.json", nodeEnv: "test" }));
  assert.throws(() => new JsonPersistenceRepository({ filePath: path.join(process.cwd(), "data", "db.json"), nodeEnv: "test" }));
  assert.throws(() => new JsonPersistenceRepository({ filePath: path.join(os.tmpdir(), "production.json"), nodeEnv: "production" }));

  const directory = await mkdtemp(path.join(os.tmpdir(), "viscollab-persistence-"));
  const filePath = path.join(directory, "state.json");
  try {
    const repo = new JsonPersistenceRepository({ filePath, nodeEnv: "test" });
    await repo.seed(snapshot());
    const result = await repo.runDocumentCommand(
      { accountId: OWNER_ID, documentId: "document-1", expectedRevision: 0 },
      (state) => ({ state: { ...state, title: "Updated" }, value: "updated" }),
    );
    assert.equal(result.ok, true);
    const written = JSON.parse(await readFile(filePath, "utf8")) as { documents: Array<{ revision: number; title: string }> };
    assert.deepEqual(written.documents.map(({ revision, title }) => ({ revision, title })), [{ revision: 1, title: "Updated" }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("JSON adapter fails loudly on malformed persisted JSON", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "viscollab-persistence-"));
  const filePath = path.join(directory, "state.json");
  try {
    await writeFile(filePath, "{not-json", "utf8");
    const repo = new JsonPersistenceRepository({ filePath, nodeEnv: "test" });
    await assert.rejects(repo.getAccount("account-owner"), /malformed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("JSON adapter rejects an external path that resolves through a symlink into the repository", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "viscollab-persistence-link-"));
  const link = path.join(directory, "inside-repository");
  try {
    await symlink(path.join(process.cwd(), "data"), link, "dir");
    assert.throws(
      () => new JsonPersistenceRepository({ filePath: path.join(link, "db.json"), nodeEnv: "test" }),
      /symlink into the repository/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
