import { randomUUID } from "node:crypto";
import { validateAccount, type Account, type AccountId, type DocumentId, type DocumentStateV2, type RoomRole, type SessionIdentity, type WorkspaceId } from "htmlcollab-app/persistence";
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

function securityAudit(type: AuditEventType, actorAccountId: AccountId, occurredAt: string, workspaceId?: WorkspaceId, metadata: AuditEventRecord["metadata"] = {}): AuditEventRecord {
  return { id: randomUUID(), type, actorAccountId, occurredAt, ...(workspaceId ? { workspaceId } : {}), metadata };
}

function emptySnapshot(): PersistedSnapshot {
  return {
    accounts: [], workspaces: [], workspaceMemberships: [], roomMemberships: [], documents: [],
    roomInvitations: [], workspaceInvitations: [], documentMetadata: [], auditEvents: [], agentRuns: [],
  };
}

/** Deterministic in-memory adapter for offline unit tests and command tests. */
export class InMemoryPersistenceRepository implements PersistenceRepository {
  private snapshot: PersistedSnapshot;

  constructor(initial: PersistedSnapshot = emptySnapshot()) {
    validateSnapshot(initial);
    this.snapshot = cloneValue(initial);
  }

  async seed(snapshot: PersistedSnapshot): Promise<void> {
    validateSnapshot(snapshot);
    this.snapshot = cloneValue(snapshot);
  }

  async inspectSnapshot(): Promise<PersistedSnapshot> { return cloneValue(this.snapshot); }

  async getAccount(accountId: AccountId): Promise<Account | null> {
    return cloneValue(this.snapshot.accounts.find((account) => account.id === accountId) ?? null);
  }

  async getAccountByNormalizedUsername(normalizedUsername: string): Promise<Account | null> {
    return cloneValue(this.snapshot.accounts.find((account) => account.normalizedUsername === normalizedUsername) ?? null);
  }

  async getSessionIdentity(accountId: AccountId): Promise<SessionIdentity | null> {
    const account = await this.getAccount(accountId);
    return account ? { accountId: account.id, username: account.username } : null;
  }

  async createAccount(account: Account): Promise<Account> {
    if (!validateAccount(account)) throw new PersistenceValidationError("invalid account registration");
    if (this.snapshot.accounts.some((item) => item.id === account.id || item.normalizedUsername === account.normalizedUsername)) {
      throw new PersistenceValidationError("account id or username already exists");
    }
    this.snapshot = { ...this.snapshot, accounts: [...this.snapshot.accounts, cloneValue(account)] };
    return cloneValue(account);
  }

  async listWorkspaces(accountId: AccountId): Promise<readonly WorkspaceRecord[]> {
    const memberships = new Set(this.snapshot.workspaceMemberships.filter((m) => m.accountId === accountId).map((m) => m.workspaceId));
    return cloneValue(this.snapshot.workspaces.filter((workspace) => memberships.has(workspace.id)));
  }

  async createWorkspace(input: { accountId: AccountId; workspace: WorkspaceRecord; ownerMembership: import("htmlcollab-app/persistence").WorkspaceMembership }): Promise<WorkspaceRecord> {
    const { workspace, ownerMembership } = input;
    if (!this.snapshot.accounts.some((account) => account.id === input.accountId)
      || workspace.ownerAccountId !== input.accountId
      || ownerMembership.workspaceId !== workspace.id || ownerMembership.accountId !== input.accountId || ownerMembership.role !== "owner"
      || this.snapshot.workspaces.some((item) => item.id === workspace.id)) {
      throw new PersistenceValidationError("invalid workspace create command");
    }
    const candidate = { ...this.snapshot, workspaces: [...this.snapshot.workspaces, workspace], workspaceMemberships: [...this.snapshot.workspaceMemberships, ownerMembership], auditEvents: [...(this.snapshot.auditEvents ?? []), securityAudit("workspace.created", input.accountId, workspace.createdAt, workspace.id)] };
    validateSnapshot(candidate);
    this.snapshot = cloneValue(candidate);
    return cloneValue(workspace);
  }

  async listWorkspaceMembers(accountId: AccountId, workspaceId: WorkspaceId): Promise<readonly WorkspaceMemberRecord[]> {
    if (!this.snapshot.workspaceMemberships.some((membership) => membership.workspaceId === workspaceId && membership.accountId === accountId)) {
      throw new WorkspaceAccessDeniedError();
    }
    return cloneValue(this.snapshot.workspaceMemberships
      .filter((membership) => membership.workspaceId === workspaceId)
      .map((membership) => {
        const account = this.snapshot.accounts.find((candidate) => candidate.id === membership.accountId)!;
        return { workspaceId, id: account.id, username: account.username, role: membership.role, createdAt: membership.createdAt };
      }));
  }

  async addWorkspaceMember(input: { accountId: AccountId; workspaceId: WorkspaceId; targetAccountId: AccountId; role: "member" }): Promise<void> {
    const workspace = this.snapshot.workspaces.find((item) => item.id === input.workspaceId);
    if (!workspace || workspace.ownerAccountId !== input.accountId) throw new WorkspaceAccessDeniedError();
    if (!this.snapshot.accounts.some((account) => account.id === input.targetAccountId)) throw new PersistenceValidationError("target account does not exist");
    if (this.snapshot.workspaceMemberships.some((membership) => membership.workspaceId === input.workspaceId && membership.accountId === input.targetAccountId)) {
      throw new PersistenceValidationError("account is already a workspace member");
    }
    const membership = { workspaceId: input.workspaceId, accountId: input.targetAccountId, role: input.role, createdAt: new Date().toISOString() } as const;
    const candidate = { ...this.snapshot, workspaceMemberships: [...this.snapshot.workspaceMemberships, membership], auditEvents: [...(this.snapshot.auditEvents ?? []), securityAudit("workspace.member_added", input.accountId, membership.createdAt, input.workspaceId, { targetAccountId: input.targetAccountId })] };
    validateSnapshot(candidate);
    this.snapshot = cloneValue(candidate);
  }

  async createWorkspaceInvitation(input: { accountId: AccountId; workspaceId: WorkspaceId; invitation: WorkspaceInvitationRecord }): Promise<WorkspaceInvitationRecord> {
    const workspace = this.snapshot.workspaces.find((item) => item.id === input.workspaceId);
    if (!workspace || workspace.ownerAccountId !== input.accountId) throw new WorkspaceAccessDeniedError();
    const invitation = input.invitation;
    if (invitation.workspaceId !== input.workspaceId || invitation.invitedByAccountId !== input.accountId || invitation.role !== "member"
      || !invitation.id || !invitation.normalizedUsername || new Date(invitation.expiresAt).valueOf() <= Date.now()
      || (this.snapshot.workspaceInvitations ?? []).some((item) => !item.acceptedAt && item.workspaceId === input.workspaceId && item.normalizedUsername === invitation.normalizedUsername)) {
      throw new PersistenceValidationError("invalid or duplicate workspace invitation");
    }
    this.snapshot = cloneValue({ ...this.snapshot, workspaceInvitations: [...(this.snapshot.workspaceInvitations ?? []), invitation], auditEvents: [...(this.snapshot.auditEvents ?? []), securityAudit("workspace.member_invited", input.accountId, invitation.createdAt, input.workspaceId, { invitationId: invitation.id })] });
    return cloneValue(invitation);
  }

  async acceptWorkspaceInvitation(input: { accountId: AccountId; workspaceId: WorkspaceId; invitationId: string }): Promise<void> {
    const account = this.snapshot.accounts.find((item) => item.id === input.accountId);
    const invitation = (this.snapshot.workspaceInvitations ?? []).find((item) => item.id === input.invitationId && item.workspaceId === input.workspaceId);
    if (!account || !invitation || invitation.acceptedAt || invitation.status === "revoked" || invitation.normalizedUsername !== account.normalizedUsername || new Date(invitation.expiresAt).valueOf() <= Date.now()) throw new WorkspaceAccessDeniedError();
    const now = new Date().toISOString();
    const workspaceMemberships = this.snapshot.workspaceMemberships.some((item) => item.workspaceId === input.workspaceId && item.accountId === input.accountId)
      ? this.snapshot.workspaceMemberships
      : [...this.snapshot.workspaceMemberships, { workspaceId: input.workspaceId, accountId: input.accountId, role: "member" as const, createdAt: now }];
    const workspaceInvitations = (this.snapshot.workspaceInvitations ?? []).map((item) => item.id === invitation.id ? { ...item, status: "accepted" as const, acceptedAt: now, acceptedByAccountId: input.accountId } : item);
    this.snapshot = cloneValue({ ...this.snapshot, workspaceMemberships, workspaceInvitations, auditEvents: [...(this.snapshot.auditEvents ?? []), securityAudit("workspace.invitation_accepted", input.accountId, now, input.workspaceId, { invitationId: invitation.id })] });
  }

  async revokeWorkspaceInvitation(input: { accountId: AccountId; workspaceId: WorkspaceId; invitationId: string }): Promise<void> {
    const workspace = this.snapshot.workspaces.find((item) => item.id === input.workspaceId);
    const invitation = (this.snapshot.workspaceInvitations ?? []).find((item) => item.id === input.invitationId && item.workspaceId === input.workspaceId);
    if (!workspace || workspace.ownerAccountId !== input.accountId || !invitation || invitation.acceptedAt) throw new WorkspaceAccessDeniedError();
    const now = new Date().toISOString();
    this.snapshot = cloneValue({ ...this.snapshot, workspaceInvitations: (this.snapshot.workspaceInvitations ?? []).map((item) => item.id === invitation.id ? { ...item, status: "revoked" as const } : item), auditEvents: [...(this.snapshot.auditEvents ?? []), securityAudit("workspace.invitation_revoked", input.accountId, now, input.workspaceId, { invitationId: invitation.id })] });
  }

  async removeWorkspaceMember(input: { accountId: AccountId; workspaceId: WorkspaceId; targetAccountId: AccountId }): Promise<void> {
    const workspace = this.snapshot.workspaces.find((item) => item.id === input.workspaceId);
    if (!workspace || workspace.ownerAccountId !== input.accountId) throw new WorkspaceAccessDeniedError();
    if (workspace.ownerAccountId === input.targetAccountId) throw new PersistenceValidationError("workspace owner cannot be removed");
    const next = this.snapshot.workspaceMemberships.filter((membership) => !(membership.workspaceId === input.workspaceId && membership.accountId === input.targetAccountId));
    if (next.length === this.snapshot.workspaceMemberships.length) throw new PersistenceValidationError("workspace member not found");
    this.snapshot = cloneValue({ ...this.snapshot, workspaceMemberships: next, auditEvents: [...(this.snapshot.auditEvents ?? []), securityAudit("workspace.member_removed", input.accountId, new Date().toISOString(), input.workspaceId, { targetAccountId: input.targetAccountId })] });
  }

  async listDocuments(accountId: AccountId, workspaceId?: WorkspaceId): Promise<readonly DocumentListItem[]> {
    const readable = new Set(this.snapshot.roomMemberships.filter((m) => m.accountId === accountId).map((m) => m.documentId));
    return cloneValue(this.snapshot.documents
      .filter((state) => readable.has(state.documentId) && (!workspaceId || state.workspaceId === workspaceId))
      .map((state) => ({
        id: state.documentId,
        workspaceId: state.workspaceId,
        title: state.title,
        kind: state.kind,
        revision: state.revision,
        activeVersionNumber: state.activeVersionNumber,
        ...(this.snapshot.documentMetadata?.find((metadata) => metadata.documentId === state.documentId)?.archivedAt
          ? { archivedAt: this.snapshot.documentMetadata.find((metadata) => metadata.documentId === state.documentId)!.archivedAt }
          : {}),
      })));
  }

  async getRoomRole(accountId: AccountId, documentId: DocumentId): Promise<RoomRole | null> {
    return this.snapshot.roomMemberships.find((m) => m.accountId === accountId && m.documentId === documentId)?.role ?? null;
  }

  async listRoomMembers(accountId: AccountId, documentId: DocumentId): Promise<readonly RoomMemberRecord[]> {
    if (!(await this.getRoomRole(accountId, documentId))) throw new RoomAccessDeniedError();
    return cloneValue(this.snapshot.roomMemberships.filter((membership) => membership.documentId === documentId).map((membership) => {
      const account = this.snapshot.accounts.find((candidate) => candidate.id === membership.accountId)!;
      return { documentId, id: account.id, username: account.username, role: membership.role, createdAt: membership.createdAt };
    }));
  }

  async acceptRoomInvitation(input: { accountId: AccountId; documentId: DocumentId; invitationId: string; expectedRevision: number }): Promise<CommandResult<import("./repository").RoomInvitationRecord>> {
    const index = this.snapshot.documents.findIndex((state) => state.documentId === input.documentId);
    if (index < 0) throw new DocumentNotFoundError(input.documentId);
    const current = this.snapshot.documents[index]!;
    if (current.revision !== input.expectedRevision) return { ok: false, status: 409, code: "revision_conflict", currentRevision: current.revision };
    const account = this.snapshot.accounts.find((item) => item.id === input.accountId);
    const invitation = (this.snapshot.roomInvitations ?? []).find((item) => item.id === input.invitationId && item.documentId === input.documentId);
    if (!account || !invitation || invitation.acceptedAt || invitation.status === "revoked" || invitation.normalizedUsername !== account.normalizedUsername || new Date(invitation.expiresAt).valueOf() <= Date.now()) throw new RoomAccessDeniedError();
    if (this.snapshot.roomMemberships.some((item) => item.documentId === input.documentId && item.accountId === input.accountId)) throw new PersistenceValidationError("already a room member");
    const now = new Date().toISOString();
    const state = { ...current, revision: current.revision + 1 };
    const documents = [...this.snapshot.documents]; documents[index] = state;
    const roomInvitations = (this.snapshot.roomInvitations ?? []).map((item) => item.id === invitation.id ? { ...item, status: "accepted" as const, acceptedAt: now, acceptedByAccountId: input.accountId } : item);
    this.snapshot = cloneValue({ ...this.snapshot, documents, roomInvitations, roomMemberships: [...this.snapshot.roomMemberships, { documentId: input.documentId, accountId: input.accountId, role: invitation.role, createdAt: now }], auditEvents: [...(this.snapshot.auditEvents ?? []), { id: `invite-accepted-${input.invitationId}`, type: "member.invitation_accepted", actorAccountId: input.accountId, documentId: input.documentId, workspaceId: current.workspaceId, occurredAt: now, metadata: { invitationId: input.invitationId } }] });
    return { ok: true, state: cloneValue(state), value: cloneValue({ ...invitation, acceptedAt: now, acceptedByAccountId: input.accountId }) };
  }

  async revokeRoomInvitation(input: { accountId: AccountId; documentId: DocumentId; invitationId: string; expectedRevision: number }): Promise<CommandResult<import("./repository").RoomInvitationRecord>> {
    const index = this.snapshot.documents.findIndex((item) => item.documentId === input.documentId); if (index < 0) throw new DocumentNotFoundError(input.documentId);
    const state = this.snapshot.documents[index]!; if (state.revision !== input.expectedRevision) return { ok: false, status: 409, code: "revision_conflict", currentRevision: state.revision };
    if (await this.getRoomRole(input.accountId, input.documentId) !== "owner") throw new RoomAccessDeniedError();
    const invitation = (this.snapshot.roomInvitations ?? []).find((item) => item.id === input.invitationId && item.documentId === input.documentId); if (!invitation || invitation.acceptedAt) throw new PersistenceValidationError("invitation unavailable");
    const now = new Date().toISOString(); const next = { ...state, revision: state.revision + 1 }; const documents = [...this.snapshot.documents]; documents[index] = next;
    const roomInvitations = (this.snapshot.roomInvitations ?? []).map((item) => item.id === invitation.id ? { ...item, status: "revoked" as const } : item);
    this.snapshot = cloneValue({ ...this.snapshot, documents, roomInvitations });
    return { ok: true, state: next, value: { ...invitation, status: "revoked" } };
  }

  async readRoom(accountId: AccountId, documentId: DocumentId): Promise<RoomRead | null> {
    const role = await this.getRoomRole(accountId, documentId);
    const state = this.snapshot.documents.find((item) => item.documentId === documentId);
    return role && state ? roomProjection(state, role) : null;
  }

  async runDocumentCommand<T>(context: DocumentCommandContext, command: DocumentCommand<T>): Promise<CommandResult<T>> {
    const index = this.snapshot.documents.findIndex((state) => state.documentId === context.documentId);
    if (index === -1) throw new DocumentNotFoundError(context.documentId);
    if (!(await this.getRoomRole(context.accountId, context.documentId))) {
      throw new RoomAccessDeniedError();
    }
    const result = applyDocumentCommand(this.snapshot.documents[index]!, context, command);
    if (result.ok) {
      const documents = [...this.snapshot.documents];
      documents[index] = result.state;
      this.snapshot = { ...this.snapshot, documents };
    }
    return cloneValue(result);
  }


  async runDocumentDomainCommand<T>(context: DocumentCommandContext, command: DocumentDomainCommand<T>): Promise<CommandResult<T>> {
    const index = this.snapshot.documents.findIndex((state) => state.documentId === context.documentId);
    if (index === -1) throw new DocumentNotFoundError(context.documentId);
    const actorRole = await this.getRoomRole(context.accountId, context.documentId);
    if (!actorRole) throw new RoomAccessDeniedError();
    const state = this.snapshot.documents[index]!;
    const result = applyDocumentDomainCommand({
      state,
      actorRole,
      roomMemberships: this.snapshot.roomMemberships.filter((membership) => membership.documentId === context.documentId),
      roomInvitations: (this.snapshot.roomInvitations ?? []).filter((invitation) => invitation.documentId === context.documentId),
      metadata: this.snapshot.documentMetadata?.find((metadata) => metadata.documentId === context.documentId) ?? { documentId: context.documentId },
    }, context, command);
    if (!result.ok) return result;
    const mutation = result.value;
    const documents = [...this.snapshot.documents];
    documents[index] = result.state;
    const roomMemberships = mutation.roomMemberships
      ? [...this.snapshot.roomMemberships.filter((membership) => membership.documentId !== context.documentId), ...mutation.roomMemberships]
      : this.snapshot.roomMemberships;
    const roomInvitations = mutation.roomInvitations
      ? [...(this.snapshot.roomInvitations ?? []).filter((invitation) => invitation.documentId !== context.documentId), ...mutation.roomInvitations]
      : (this.snapshot.roomInvitations ?? []);
    const documentMetadata = mutation.metadata
      ? [...(this.snapshot.documentMetadata ?? []).filter((metadata) => metadata.documentId !== context.documentId), mutation.metadata]
      : (this.snapshot.documentMetadata ?? []);
    assertDomainSideEffects(context, state.workspaceId, mutation);
    const candidate: PersistedSnapshot = {
      ...this.snapshot,
      documents,
      roomMemberships,
      roomInvitations,
      documentMetadata,
      auditEvents: [...(this.snapshot.auditEvents ?? []), ...(mutation.auditEvents ?? [])],
      agentRuns: [...(this.snapshot.agentRuns ?? []), ...(mutation.agentRuns ?? [])],
    };
    validateSnapshot(candidate);
    this.snapshot = cloneValue(candidate);
    return cloneValue({ ok: true, state: result.state, value: mutation.value });
  }

  async createDocumentRecord(input: CreateDocumentRecordInput): Promise<DocumentStateV2> {
    const workspace = this.snapshot.workspaces.find((item) => item.id === input.workspaceId);
    if (!workspace || workspace.ownerAccountId !== input.accountId) throw new WorkspaceAccessDeniedError();
    if (this.snapshot.documents.some((item) => item.documentId === input.state.documentId)) {
      throw new PersistenceValidationError("document id already exists");
    }
    if (input.state.workspaceId !== input.workspaceId || input.state.revision !== 0
      || input.ownerMembership.documentId !== input.state.documentId
      || input.ownerMembership.accountId !== input.accountId || input.ownerMembership.role !== "owner"
      || input.auditEvent.actorAccountId !== input.accountId
      || input.auditEvent.documentId !== input.state.documentId || input.auditEvent.workspaceId !== input.workspaceId) {
      throw new PersistenceValidationError("create document command has inconsistent identities");
    }
    const candidate: PersistedSnapshot = {
      ...this.snapshot,
      documents: [...this.snapshot.documents, input.state],
      roomMemberships: [...this.snapshot.roomMemberships, input.ownerMembership],
      documentMetadata: [...(this.snapshot.documentMetadata ?? []), { documentId: input.state.documentId }],
      auditEvents: [...(this.snapshot.auditEvents ?? []), input.auditEvent],
    };
    validateSnapshot(candidate);
    this.snapshot = cloneValue(candidate);
    return cloneValue(input.state);
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
