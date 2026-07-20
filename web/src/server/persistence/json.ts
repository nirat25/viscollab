import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Account, AccountId, DocumentId, DocumentStateV2, RoomRole, SessionIdentity, WorkspaceId, WorkspaceMembership } from "htmlcollab-app/persistence";
import {
  applyDocumentDomainCommand,
  applyDocumentCommand,
  cloneValue,
  DocumentNotFoundError,
  RoomAccessDeniedError,
  roomProjection,
  validateSnapshot,
  WorkspaceAccessDeniedError,
  type CommandResult,
  type DocumentCommand,
  type DocumentCommandContext,
  type DocumentDomainCommand,
  type DocumentListItem,
  type PersistedSnapshot,
  type CreateDocumentRecordInput,
  PersistenceValidationError,
  type PersistenceRepository,
  type RoomRead,
  type WorkspaceRecord,
  type WorkspaceMemberRecord,
  type RoomMemberRecord,
  type WorkspaceInvitationRecord,
  type AuditEventRecord,
  type AuditEventType,
} from "./repository";

const JSON_SCHEMA_VERSION = 1;
const writeLocks = new Map<string, Promise<void>>();
const CODE_REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

interface JsonStore extends PersistedSnapshot { schemaVersion: 1; }

function securityAudit(type: AuditEventType, actorAccountId: AccountId, occurredAt: string, workspaceId?: WorkspaceId, metadata: AuditEventRecord["metadata"] = {}): AuditEventRecord {
  return { id: randomUUID(), type, actorAccountId, occurredAt, ...(workspaceId ? { workspaceId } : {}), metadata };
}

export interface JsonRepositoryOptions {
  /** Must be an explicit absolute path outside the checked-in repository. */
  filePath: string;
  nodeEnv?: string;
  /** JSON persistence has no inter-process coordination.  Other values fail closed. */
  concurrency?: "single-process";
}

function emptyStore(): JsonStore {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    accounts: [], workspaces: [], workspaceMemberships: [], roomMemberships: [], documents: [],
    roomInvitations: [], workspaceInvitations: [], documentMetadata: [], auditEvents: [], agentRuns: [],
  };
}

function assertSafePath(options: JsonRepositoryOptions): string {
  if (options.nodeEnv === "production") throw new Error("JSON persistence is disabled in production");
  if (!path.isAbsolute(options.filePath)) throw new Error("COLLAB_JSON_DB_PATH must be an absolute path");
  const absolutePath = path.resolve(options.filePath);
  const repositoryRoot = CODE_REPOSITORY_ROOT;
  const relative = path.relative(repositoryRoot, absolutePath);
  const checkedInDemo = path.resolve(repositoryRoot, "web", "data", "db.json");
  if (options.concurrency !== undefined && options.concurrency !== "single-process") {
    throw new Error("JSON persistence supports only single-process operation");
  }
  if (absolutePath === checkedInDemo || relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..")) {
    throw new Error("COLLAB_JSON_DB_PATH must be outside the repository and must not target web/data/db.json");
  }
  const parent = path.dirname(absolutePath);
  if (existsSync(parent)) {
    const realParent = realpathSync(parent);
    const realRepositoryRoot = realpathSync(repositoryRoot);
    const realRelative = path.relative(realRepositoryRoot, realParent);
    if (realRelative === "" || (!realRelative.startsWith(`..${path.sep}`) && realRelative !== "..")) {
      throw new Error("COLLAB_JSON_DB_PATH resolves through a symlink into the repository");
    }
  }
  return absolutePath;
}

export function jsonDatabasePathFromEnvironment(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.COLLAB_JSON_DB_PATH;
  if (!configured) throw new Error("COLLAB_JSON_DB_PATH must be explicitly configured for JSON persistence");
  return assertSafePath({ filePath: configured, nodeEnv: environment.NODE_ENV, concurrency: "single-process" });
}

function parseStore(raw: string, filePath: string): JsonStore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`JSON persistence file is malformed (${filePath}): ${(error as Error).message}`);
  }
  const allowedKeys = new Set([
    "schemaVersion", "accounts", "workspaces", "workspaceMemberships", "roomMemberships", "documents",
    "roomInvitations", "workspaceInvitations", "documentMetadata", "auditEvents", "agentRuns",
  ]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || (parsed as { schemaVersion?: unknown }).schemaVersion !== JSON_SCHEMA_VERSION || Object.keys(parsed).some((key) => !allowedKeys.has(key))) {
    throw new Error(`JSON persistence file has an unsupported schema (${filePath})`);
  }
  const store = parsed as JsonStore;
  validateSnapshot(store);
  return store;
}

async function readStore(filePath: string): Promise<JsonStore> {
  try {
    return parseStore(await readFile(filePath, "utf8"), filePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw error;
  }
}

/** Full-file durable write: validate, sibling temp, fsync, then atomic rename. */
export async function writeStoreAtomically(filePath: string, store: JsonStore): Promise<void> {
  validateSnapshot(store);
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(tempPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(store, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(tempPath, filePath);
    // Best effort directory fsync: supported on normal POSIX filesystems but
    // intentionally not fatal on filesystems that reject opening directories.
    try {
      const directory = await open(path.dirname(filePath), "r");
      await directory.sync();
      await directory.close();
    } catch { /* rename remains atomic even where directory fsync is unavailable */ }
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

async function withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeLocks.get(filePath) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  writeLocks.set(filePath, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (writeLocks.get(filePath) === tail) writeLocks.delete(filePath);
  }
}

/**
 * Explicit local/E2E adapter.  It is process-local by design; callers must
 * not share a JSON file between node processes.
 */
export class JsonPersistenceRepository implements PersistenceRepository {
  readonly filePath: string;

  constructor(options: JsonRepositoryOptions) {
    this.filePath = assertSafePath({ ...options, concurrency: options.concurrency ?? "single-process" });
  }

  async seed(snapshot: PersistedSnapshot): Promise<void> {
    validateSnapshot(snapshot);
    await withFileLock(this.filePath, () => writeStoreAtomically(this.filePath, { schemaVersion: JSON_SCHEMA_VERSION, ...cloneValue(snapshot) }));
  }

  async inspectSnapshot(): Promise<PersistedSnapshot> { return cloneValue(await this.store()); }

  private async store(): Promise<JsonStore> { return readStore(this.filePath); }

  async getAccount(accountId: AccountId): Promise<Account | null> {
    return cloneValue((await this.store()).accounts.find((account) => account.id === accountId) ?? null);
  }

  async getAccountByNormalizedUsername(normalizedUsername: string): Promise<Account | null> {
    return cloneValue((await this.store()).accounts.find((account) => account.normalizedUsername === normalizedUsername) ?? null);
  }

  async getSessionIdentity(accountId: AccountId): Promise<SessionIdentity | null> {
    const account = await this.getAccount(accountId);
    return account ? { accountId: account.id, username: account.username } : null;
  }

  async createAccount(account: Account): Promise<Account> {
    return withFileLock(this.filePath, async () => {
      const store = await this.store();
      if (store.accounts.some((item) => item.id === account.id || item.normalizedUsername === account.normalizedUsername)) {
        throw new PersistenceValidationError("account id or username already exists");
      }
      const next = { ...store, accounts: [...store.accounts, cloneValue(account)] };
      validateSnapshot(next);
      await writeStoreAtomically(this.filePath, next);
      return cloneValue(account);
    });
  }

  async listWorkspaces(accountId: AccountId): Promise<readonly WorkspaceRecord[]> {
    const store = await this.store();
    const ids = new Set(store.workspaceMemberships.filter((membership) => membership.accountId === accountId).map((membership) => membership.workspaceId));
    return cloneValue(store.workspaces.filter((workspace) => ids.has(workspace.id)));
  }

  async createWorkspace(input: { accountId: AccountId; workspace: WorkspaceRecord; ownerMembership: WorkspaceMembership }): Promise<WorkspaceRecord> {
    return withFileLock(this.filePath, async () => {
      const store = await this.store();
      const { workspace, ownerMembership } = input;
      if (!store.accounts.some((account) => account.id === input.accountId)
        || store.workspaces.some((item) => item.id === workspace.id)
        || workspace.ownerAccountId !== input.accountId
        || ownerMembership.workspaceId !== workspace.id || ownerMembership.accountId !== input.accountId || ownerMembership.role !== "owner") {
        throw new PersistenceValidationError("invalid workspace create command");
      }
      const next = { ...store, workspaces: [...store.workspaces, workspace], workspaceMemberships: [...store.workspaceMemberships, ownerMembership], auditEvents: [...(store.auditEvents ?? []), securityAudit("workspace.created", input.accountId, workspace.createdAt, workspace.id)] };
      validateSnapshot(next);
      await writeStoreAtomically(this.filePath, next);
      return cloneValue(workspace);
    });
  }

  async listWorkspaceMembers(accountId: AccountId, workspaceId: WorkspaceId): Promise<readonly WorkspaceMemberRecord[]> {
    const store = await this.store();
    if (!store.workspaceMemberships.some((membership) => membership.workspaceId === workspaceId && membership.accountId === accountId)) {
      throw new WorkspaceAccessDeniedError();
    }
    return cloneValue(store.workspaceMemberships.filter((membership) => membership.workspaceId === workspaceId).map((membership) => {
      const account = store.accounts.find((candidate) => candidate.id === membership.accountId)!;
      return { workspaceId, id: account.id, username: account.username, role: membership.role, createdAt: membership.createdAt };
    }));
  }

  async addWorkspaceMember(input: { accountId: AccountId; workspaceId: WorkspaceId; targetAccountId: AccountId; role: "member" }): Promise<void> {
    await withFileLock(this.filePath, async () => {
      const store = await this.store();
      const workspace = store.workspaces.find((item) => item.id === input.workspaceId);
      if (!workspace || workspace.ownerAccountId !== input.accountId) throw new WorkspaceAccessDeniedError();
      if (!store.accounts.some((account) => account.id === input.targetAccountId)) throw new PersistenceValidationError("target account does not exist");
      if (store.workspaceMemberships.some((membership) => membership.workspaceId === input.workspaceId && membership.accountId === input.targetAccountId)) throw new PersistenceValidationError("account is already a workspace member");
      const now = new Date().toISOString();
      const next = { ...store, workspaceMemberships: [...store.workspaceMemberships, { workspaceId: input.workspaceId, accountId: input.targetAccountId, role: input.role, createdAt: now }], auditEvents: [...(store.auditEvents ?? []), securityAudit("workspace.member_added", input.accountId, now, input.workspaceId, { targetAccountId: input.targetAccountId })] };
      validateSnapshot(next);
      await writeStoreAtomically(this.filePath, next);
    });
  }

  async createWorkspaceInvitation(input: { accountId: AccountId; workspaceId: WorkspaceId; invitation: WorkspaceInvitationRecord }): Promise<WorkspaceInvitationRecord> {
    return withFileLock(this.filePath, async () => {
      const store = await this.store();
      const workspace = store.workspaces.find((item) => item.id === input.workspaceId);
      const invitation = input.invitation;
      if (!workspace || workspace.ownerAccountId !== input.accountId || invitation.workspaceId !== input.workspaceId
        || invitation.invitedByAccountId !== input.accountId || invitation.role !== "member" || !invitation.id || !invitation.normalizedUsername
        || new Date(invitation.expiresAt).valueOf() <= Date.now()
        || (store.workspaceInvitations ?? []).some((item) => !item.acceptedAt && item.workspaceId === input.workspaceId && item.normalizedUsername === invitation.normalizedUsername)) {
        throw new PersistenceValidationError("invalid or duplicate workspace invitation");
      }
      const next = { ...store, workspaceInvitations: [...(store.workspaceInvitations ?? []), invitation], auditEvents: [...(store.auditEvents ?? []), securityAudit("workspace.member_invited", input.accountId, invitation.createdAt, input.workspaceId, { invitationId: invitation.id })] };
      validateSnapshot(next);
      await writeStoreAtomically(this.filePath, next);
      return cloneValue(invitation);
    });
  }

  async acceptWorkspaceInvitation(input: { accountId: AccountId; workspaceId: WorkspaceId; invitationId: string }): Promise<void> {
    await withFileLock(this.filePath, async () => {
      const store = await this.store();
      const account = store.accounts.find((item) => item.id === input.accountId);
      const invitation = (store.workspaceInvitations ?? []).find((item) => item.id === input.invitationId && item.workspaceId === input.workspaceId);
      if (!account || !invitation || invitation.acceptedAt || invitation.status === "revoked" || invitation.normalizedUsername !== account.normalizedUsername || new Date(invitation.expiresAt).valueOf() <= Date.now()) throw new WorkspaceAccessDeniedError();
      const now = new Date().toISOString();
      const workspaceMemberships = store.workspaceMemberships.some((item) => item.workspaceId === input.workspaceId && item.accountId === input.accountId) ? store.workspaceMemberships : [...store.workspaceMemberships, { workspaceId: input.workspaceId, accountId: input.accountId, role: "member" as const, createdAt: now }];
      const workspaceInvitations = (store.workspaceInvitations ?? []).map((item) => item.id === invitation.id ? { ...item, status: "accepted" as const, acceptedAt: now, acceptedByAccountId: input.accountId } : item);
      await writeStoreAtomically(this.filePath, { ...store, workspaceMemberships, workspaceInvitations, auditEvents: [...(store.auditEvents ?? []), securityAudit("workspace.invitation_accepted", input.accountId, now, input.workspaceId, { invitationId: invitation.id })] });
    });
  }

  async revokeWorkspaceInvitation(input: { accountId: AccountId; workspaceId: WorkspaceId; invitationId: string }): Promise<void> {
    await withFileLock(this.filePath, async () => {
      const store = await this.store(); const workspace = store.workspaces.find((item) => item.id === input.workspaceId);
      const invitation = (store.workspaceInvitations ?? []).find((item) => item.id === input.invitationId && item.workspaceId === input.workspaceId);
      if (!workspace || workspace.ownerAccountId !== input.accountId || !invitation || invitation.acceptedAt) throw new WorkspaceAccessDeniedError();
      const now = new Date().toISOString();
      await writeStoreAtomically(this.filePath, { ...store, workspaceInvitations: (store.workspaceInvitations ?? []).map((item) => item.id === invitation.id ? { ...item, status: "revoked" as const } : item), auditEvents: [...(store.auditEvents ?? []), securityAudit("workspace.invitation_revoked", input.accountId, now, input.workspaceId, { invitationId: invitation.id })] });
    });
  }

  async removeWorkspaceMember(input: { accountId: AccountId; workspaceId: WorkspaceId; targetAccountId: AccountId }): Promise<void> {
    await withFileLock(this.filePath, async () => {
      const store = await this.store();
      const workspace = store.workspaces.find((item) => item.id === input.workspaceId);
      if (!workspace || workspace.ownerAccountId !== input.accountId) throw new WorkspaceAccessDeniedError();
      if (workspace.ownerAccountId === input.targetAccountId) throw new PersistenceValidationError("workspace owner cannot be removed");
      const memberships = store.workspaceMemberships.filter((membership) => !(membership.workspaceId === input.workspaceId && membership.accountId === input.targetAccountId));
      if (memberships.length === store.workspaceMemberships.length) throw new PersistenceValidationError("workspace member not found");
      await writeStoreAtomically(this.filePath, { ...store, workspaceMemberships: memberships, auditEvents: [...(store.auditEvents ?? []), securityAudit("workspace.member_removed", input.accountId, new Date().toISOString(), input.workspaceId, { targetAccountId: input.targetAccountId })] });
    });
  }

  async listDocuments(accountId: AccountId, workspaceId?: WorkspaceId): Promise<readonly DocumentListItem[]> {
    const store = await this.store();
    const ids = new Set(store.roomMemberships.filter((membership) => membership.accountId === accountId).map((membership) => membership.documentId));
    return cloneValue(store.documents.filter((state) => ids.has(state.documentId) && (!workspaceId || state.workspaceId === workspaceId)).map((state) => ({
      id: state.documentId, workspaceId: state.workspaceId, title: state.title, kind: state.kind,
      revision: state.revision, activeVersionNumber: state.activeVersionNumber,
      ...(store.documentMetadata?.find((metadata) => metadata.documentId === state.documentId)?.archivedAt
        ? { archivedAt: store.documentMetadata.find((metadata) => metadata.documentId === state.documentId)!.archivedAt }
        : {}),
    })));
  }

  async getRoomRole(accountId: AccountId, documentId: DocumentId): Promise<RoomRole | null> {
    return (await this.store()).roomMemberships.find((membership) => membership.accountId === accountId && membership.documentId === documentId)?.role ?? null;
  }

  async listRoomMembers(accountId: AccountId, documentId: DocumentId): Promise<readonly RoomMemberRecord[]> {
    const store = await this.store();
    if (!store.roomMemberships.some((membership) => membership.documentId === documentId && membership.accountId === accountId)) throw new RoomAccessDeniedError();
    return cloneValue(store.roomMemberships.filter((membership) => membership.documentId === documentId).map((membership) => {
      const account = store.accounts.find((candidate) => candidate.id === membership.accountId)!;
      return { documentId, id: account.id, username: account.username, role: membership.role, createdAt: membership.createdAt };
    }));
  }

  async acceptRoomInvitation(input: { accountId: AccountId; documentId: DocumentId; invitationId: string; expectedRevision: number }): Promise<CommandResult<import("./repository").RoomInvitationRecord>> {
    return withFileLock(this.filePath, async () => {
      const store = await this.store();
      const index = store.documents.findIndex((state) => state.documentId === input.documentId);
      if (index < 0) throw new DocumentNotFoundError(input.documentId);
      const current = store.documents[index]!;
      if (current.revision !== input.expectedRevision) return { ok: false, status: 409, code: "revision_conflict", currentRevision: current.revision };
      const account = store.accounts.find((item) => item.id === input.accountId);
      const invitation = (store.roomInvitations ?? []).find((item) => item.id === input.invitationId && item.documentId === input.documentId);
      if (!account || !invitation || invitation.acceptedAt || invitation.status === "revoked" || invitation.normalizedUsername !== account.normalizedUsername || new Date(invitation.expiresAt).valueOf() <= Date.now()) throw new RoomAccessDeniedError();
      if (store.roomMemberships.some((item) => item.documentId === input.documentId && item.accountId === input.accountId)) throw new PersistenceValidationError("already a room member");
      const now = new Date().toISOString(); const state = { ...current, revision: current.revision + 1 }; const documents = [...store.documents]; documents[index] = state;
      const roomInvitations = (store.roomInvitations ?? []).map((item) => item.id === invitation.id ? { ...item, status: "accepted" as const, acceptedAt: now, acceptedByAccountId: input.accountId } : item);
      const next = { ...store, documents, roomInvitations, roomMemberships: [...store.roomMemberships, { documentId: input.documentId, accountId: input.accountId, role: invitation.role, createdAt: now }], auditEvents: [...(store.auditEvents ?? []), { id: `invite-accepted-${input.invitationId}`, type: "member.invitation_accepted" as const, actorAccountId: input.accountId, documentId: input.documentId, workspaceId: current.workspaceId, occurredAt: now, metadata: { invitationId: input.invitationId } }] };
      validateSnapshot(next); await writeStoreAtomically(this.filePath, next);
      return { ok: true, state: cloneValue(state), value: cloneValue({ ...invitation, acceptedAt: now, acceptedByAccountId: input.accountId }) };
    });
  }

  async revokeRoomInvitation(input: { accountId: AccountId; documentId: DocumentId; invitationId: string; expectedRevision: number }): Promise<CommandResult<import("./repository").RoomInvitationRecord>> {
    return withFileLock(this.filePath, async () => {
      const store = await this.store(); const index = store.documents.findIndex((item) => item.documentId === input.documentId);
      if (index < 0) throw new DocumentNotFoundError(input.documentId); const state = store.documents[index]!;
      if (state.revision !== input.expectedRevision) return { ok: false, status: 409, code: "revision_conflict", currentRevision: state.revision };
      if (!(await this.getRoomRole(input.accountId, input.documentId)) || (await this.getRoomRole(input.accountId, input.documentId)) !== "owner") throw new RoomAccessDeniedError();
      const invitation = (store.roomInvitations ?? []).find((item) => item.id === input.invitationId && item.documentId === input.documentId); if (!invitation || invitation.acceptedAt) throw new PersistenceValidationError("invitation unavailable");
      const nextState = { ...state, revision: state.revision + 1 }; const documents = [...store.documents]; documents[index] = nextState;
      const roomInvitations = (store.roomInvitations ?? []).map((item) => item.id === invitation.id ? { ...item, status: "revoked" as const } : item);
      await writeStoreAtomically(this.filePath, { ...store, documents, roomInvitations });
      return { ok: true, state: cloneValue(nextState), value: { ...cloneValue(invitation), status: "revoked" } };
    });
  }

  async readRoom(accountId: AccountId, documentId: DocumentId): Promise<RoomRead | null> {
    const store = await this.store();
    const role = store.roomMemberships.find((membership) => membership.accountId === accountId && membership.documentId === documentId)?.role;
    const state = store.documents.find((item) => item.documentId === documentId);
    return role && state ? roomProjection(state, role) : null;
  }

  async runDocumentCommand<T>(context: DocumentCommandContext, command: DocumentCommand<T>): Promise<CommandResult<T>> {
    return withFileLock(this.filePath, async () => {
      const store = await this.store();
      const index = store.documents.findIndex((state) => state.documentId === context.documentId);
      if (index === -1) throw new DocumentNotFoundError(context.documentId);
      if (!store.roomMemberships.some((membership) => membership.accountId === context.accountId && membership.documentId === context.documentId)) {
        throw new RoomAccessDeniedError();
      }
      const result = applyDocumentCommand(store.documents[index]!, context, command);
      if (!result.ok) return result;
      const documents = [...store.documents];
      documents[index] = result.state;
      await writeStoreAtomically(this.filePath, { ...store, documents });
      return cloneValue(result);
    });
  }


  async runDocumentDomainCommand<T>(context: DocumentCommandContext, command: DocumentDomainCommand<T>): Promise<CommandResult<T>> {
    return withFileLock(this.filePath, async () => {
      const store = await this.store();
      const index = store.documents.findIndex((state) => state.documentId === context.documentId);
      if (index === -1) throw new DocumentNotFoundError(context.documentId);
      const actorRole = store.roomMemberships.find((membership) => membership.accountId === context.accountId && membership.documentId === context.documentId)?.role;
      if (!actorRole) throw new RoomAccessDeniedError();
      const state = store.documents[index]!;
      const result = applyDocumentDomainCommand({
        state,
        actorRole,
        roomMemberships: store.roomMemberships.filter((membership) => membership.documentId === context.documentId),
        roomInvitations: (store.roomInvitations ?? []).filter((invitation) => invitation.documentId === context.documentId),
        metadata: store.documentMetadata?.find((metadata) => metadata.documentId === context.documentId) ?? { documentId: context.documentId },
      }, context, command);
      if (!result.ok) return result;
      const mutation = result.value;
      assertDomainSideEffects(context, state.workspaceId, mutation);
      const documents = [...store.documents];
      documents[index] = result.state;
      const next: JsonStore = {
        ...store,
        documents,
        roomMemberships: mutation.roomMemberships
          ? [...store.roomMemberships.filter((membership) => membership.documentId !== context.documentId), ...mutation.roomMemberships]
          : store.roomMemberships,
        roomInvitations: mutation.roomInvitations
          ? [...(store.roomInvitations ?? []).filter((invitation) => invitation.documentId !== context.documentId), ...mutation.roomInvitations]
          : (store.roomInvitations ?? []),
        documentMetadata: mutation.metadata
          ? [...(store.documentMetadata ?? []).filter((metadata) => metadata.documentId !== context.documentId), mutation.metadata]
          : (store.documentMetadata ?? []),
        auditEvents: [...(store.auditEvents ?? []), ...(mutation.auditEvents ?? [])],
        agentRuns: [...(store.agentRuns ?? []), ...(mutation.agentRuns ?? [])],
      };
      validateSnapshot(next);
      await writeStoreAtomically(this.filePath, next);
      return cloneValue({ ok: true, state: result.state, value: mutation.value });
    });
  }

  async createDocumentRecord(input: CreateDocumentRecordInput): Promise<DocumentStateV2> {
    return withFileLock(this.filePath, async () => {
      const store = await this.store();
      const workspace = store.workspaces.find((item) => item.id === input.workspaceId);
      if (!workspace || workspace.ownerAccountId !== input.accountId) throw new WorkspaceAccessDeniedError();
      if (store.documents.some((item) => item.documentId === input.state.documentId)) {
        throw new PersistenceValidationError("document id already exists");
      }
      if (input.state.workspaceId !== input.workspaceId || input.state.revision !== 0
        || input.ownerMembership.documentId !== input.state.documentId
        || input.ownerMembership.accountId !== input.accountId || input.ownerMembership.role !== "owner"
        || input.auditEvent.actorAccountId !== input.accountId
        || input.auditEvent.documentId !== input.state.documentId || input.auditEvent.workspaceId !== input.workspaceId) {
        throw new PersistenceValidationError("create document command has inconsistent identities");
      }
      const candidate: JsonStore = {
        ...store,
        documents: [...store.documents, input.state],
        roomMemberships: [...store.roomMemberships, input.ownerMembership],
        documentMetadata: [...(store.documentMetadata ?? []), { documentId: input.state.documentId }],
        auditEvents: [...(store.auditEvents ?? []), input.auditEvent],
      };
      validateSnapshot(candidate);
      await writeStoreAtomically(this.filePath, candidate);
      return cloneValue(input.state);
    });
  }
}

function assertDomainSideEffects<T>(
  context: DocumentCommandContext,
  workspaceId: WorkspaceId,
  mutation: ReturnType<DocumentDomainCommand<T>>,
): void {
  if (mutation.roomMemberships?.some((membership) => membership.documentId !== context.documentId)
    || mutation.roomInvitations?.some((invitation) => invitation.documentId !== context.documentId)
    || (mutation.metadata && mutation.metadata.documentId !== context.documentId)) {
    throw new PersistenceValidationError("document command attempted a cross-document side effect");
  }
  if (mutation.auditEvents?.some((event) => event.actorAccountId !== context.accountId
    || event.documentId !== context.documentId || event.workspaceId !== workspaceId)) {
    throw new PersistenceValidationError("audit event attribution is inconsistent with the command");
  }
  if (mutation.agentRuns?.some((run) => run.actorAccountId !== context.accountId || run.documentId !== context.documentId)) {
    throw new PersistenceValidationError("agent run attribution is inconsistent with the command");
  }
}

export function createJsonPersistenceRepositoryFromEnvironment(environment: NodeJS.ProcessEnv = process.env): JsonPersistenceRepository {
  return new JsonPersistenceRepository({ filePath: jsonDatabasePathFromEnvironment(environment), nodeEnv: environment.NODE_ENV, concurrency: "single-process" });
}
