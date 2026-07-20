import { capabilitiesForRole, checkExpectedRevision, validateAccount, validateDocumentStateV2 } from "htmlcollab-app/persistence";
import type {
  Account,
  AccountId,
  Capability,
  DocumentId,
  DocumentStateV2,
  RoomMembership,
  RoomRole,
  SessionIdentity,
  WorkspaceId,
  WorkspaceMembership,
} from "htmlcollab-app/persistence";

/**
 * Server-only persistence boundary.  HTTP handlers deliberately receive no
 * access to a blob store or a collection-write method.
 */

export interface WorkspaceRecord {
  id: WorkspaceId;
  name: string;
  ownerAccountId: AccountId;
  createdAt: string;
  updatedAt: string;
}

/** Safe account projection for catalog and membership responses. */
export interface AccountSummary {
  id: AccountId;
  username: string;
}

export interface WorkspaceMemberRecord extends AccountSummary {
  workspaceId: WorkspaceId;
  role: WorkspaceMembership["role"];
  createdAt: string;
}

export interface RoomMemberRecord extends AccountSummary {
  documentId: DocumentId;
  role: RoomRole;
  createdAt: string;
}

export interface DocumentListItem {
  id: DocumentId;
  workspaceId: WorkspaceId;
  title: string;
  kind: DocumentStateV2["kind"];
  revision: number;
  activeVersionNumber: number;
  archivedAt?: string;
}

export interface RoomInvitationRecord {
  id: string;
  documentId: DocumentId;
  normalizedUsername: string;
  role: Exclude<RoomRole, "owner">;
  invitedByAccountId: AccountId;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  acceptedByAccountId?: AccountId;
  status?: "pending" | "accepted" | "revoked" | "expired";
}

export interface WorkspaceInvitationRecord {
  id: string;
  workspaceId: WorkspaceId;
  normalizedUsername: string;
  role: "member";
  invitedByAccountId: AccountId;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  acceptedByAccountId?: AccountId;
  status?: "pending" | "accepted" | "revoked" | "expired";
}

export interface DocumentMetadataRecord {
  documentId: DocumentId;
  archivedAt?: string;
  archivedByAccountId?: AccountId;
}

export type AuditEventType =
  | "workspace.created" | "workspace.member_added" | "workspace.member_removed"
  | "workspace.member_invited" | "workspace.invitation_accepted" | "workspace.invitation_revoked"
  | "comment.created" | "comment.replied" | "comment.resolved" | "comment.reopened"
  | "verdict.set_self" | "version.created" | "version.edited" | "version.regenerated"
  | "version.published" | "source.locked" | "source.unlocked" | "document.created"
  | "room.archived" | "member.invited" | "member.invitation_accepted"
  | "member.role_changed" | "member.removed" | "ownership.transferred" | "agent.ask_succeeded"
  | "agent.exported";

export interface AuditEventRecord {
  id: string;
  type: AuditEventType;
  actorAccountId: AccountId;
  occurredAt: string;
  documentId?: DocumentId;
  workspaceId?: WorkspaceId;
  /** All metadata is constructed by the command service from a strict allowlist. */
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface AgentRunRecord {
  id: string;
  kind: "ask";
  actorAccountId: AccountId;
  documentId: DocumentId;
  createdAt: string;
  outcome: "succeeded";
  model?: string;
  preset?: string;
  semanticArtifactFingerprint?: string;
}

export interface RoomRead {
  state: DocumentStateV2;
  role: RoomRole;
  capabilities: readonly Capability[];
}

export interface RevisionConflictResult {
  ok: false;
  status: 409;
  code: "revision_conflict";
  currentRevision: number;
}

export interface CommandSuccess<T> {
  ok: true;
  state: DocumentStateV2;
  value: T;
}

export type CommandResult<T> = CommandSuccess<T> | RevisionConflictResult;

export interface DocumentCommandContext {
  accountId: AccountId;
  documentId: DocumentId;
  expectedRevision: number;
}

/**
 * A command mutator is server code, never request data.  It gives later
 * narrow command handlers one transaction primitive without reopening a bulk
 * `saveState` API to clients.
 */
export type DocumentCommand<T> = (
  current: Readonly<DocumentStateV2>,
) => { state: DocumentStateV2; value: T };

export interface DocumentDomainEnvironment {
  state: Readonly<DocumentStateV2>;
  actorRole: RoomRole;
  roomMemberships: readonly RoomMembership[];
  roomInvitations: readonly RoomInvitationRecord[];
  metadata: Readonly<DocumentMetadataRecord>;
}

export interface DocumentDomainMutation<T> {
  state: DocumentStateV2;
  value: T;
  roomMemberships?: readonly RoomMembership[];
  roomInvitations?: readonly RoomInvitationRecord[];
  metadata?: DocumentMetadataRecord;
  auditEvents?: readonly AuditEventRecord[];
  agentRuns?: readonly AgentRunRecord[];
}

export type DocumentDomainCommand<T> = (
  environment: Readonly<DocumentDomainEnvironment>,
) => DocumentDomainMutation<T>;

export interface CreateDocumentRecordInput {
  accountId: AccountId;
  workspaceId: WorkspaceId;
  state: DocumentStateV2;
  ownerMembership: RoomMembership;
  auditEvent: AuditEventRecord;
}

export interface PersistedSnapshot {
  accounts: readonly Account[];
  workspaces: readonly WorkspaceRecord[];
  workspaceMemberships: readonly WorkspaceMembership[];
  roomMemberships: readonly RoomMembership[];
  documents: readonly DocumentStateV2[];
  roomInvitations?: readonly RoomInvitationRecord[];
  workspaceInvitations?: readonly WorkspaceInvitationRecord[];
  documentMetadata?: readonly DocumentMetadataRecord[];
  auditEvents?: readonly AuditEventRecord[];
  agentRuns?: readonly AgentRunRecord[];
}

/**
 * Minimal common adapter contract.  PERS-006 adds named domain commands on
 * top of `runDocumentCommand`; this low-level primitive is intentionally not
 * exported to routes and always owns the revision increment.
 */
export interface PersistenceRepository {
  getAccount(accountId: AccountId): Promise<Account | null>;
  getAccountByNormalizedUsername(normalizedUsername: string): Promise<Account | null>;
  getSessionIdentity(accountId: AccountId): Promise<SessionIdentity | null>;
  /** Account creation is a server-only registration command. */
  createAccount(account: Account): Promise<Account>;
  listWorkspaces(accountId: AccountId): Promise<readonly WorkspaceRecord[]>;
  createWorkspace(input: { accountId: AccountId; workspace: WorkspaceRecord; ownerMembership: WorkspaceMembership }): Promise<WorkspaceRecord>;
  /** Workspace navigation membership is not room access. */
  listWorkspaceMembers(accountId: AccountId, workspaceId: WorkspaceId): Promise<readonly WorkspaceMemberRecord[]>;
  addWorkspaceMember(input: { accountId: AccountId; workspaceId: WorkspaceId; targetAccountId: AccountId; role: "member" }): Promise<void>;
  createWorkspaceInvitation(input: { accountId: AccountId; workspaceId: WorkspaceId; invitation: WorkspaceInvitationRecord }): Promise<WorkspaceInvitationRecord>;
  acceptWorkspaceInvitation(input: { accountId: AccountId; workspaceId: WorkspaceId; invitationId: string }): Promise<void>;
  revokeWorkspaceInvitation(input: { accountId: AccountId; workspaceId: WorkspaceId; invitationId: string }): Promise<void>;
  removeWorkspaceMember(input: { accountId: AccountId; workspaceId: WorkspaceId; targetAccountId: AccountId }): Promise<void>;
  listDocuments(accountId: AccountId, workspaceId?: WorkspaceId): Promise<readonly DocumentListItem[]>;
  getRoomRole(accountId: AccountId, documentId: DocumentId): Promise<RoomRole | null>;
  listRoomMembers(accountId: AccountId, documentId: DocumentId): Promise<readonly RoomMemberRecord[]>;
  acceptRoomInvitation(input: { accountId: AccountId; documentId: DocumentId; invitationId: string; expectedRevision: number }): Promise<CommandResult<RoomInvitationRecord>>;
  revokeRoomInvitation(input: { accountId: AccountId; documentId: DocumentId; invitationId: string; expectedRevision: number }): Promise<CommandResult<RoomInvitationRecord>>;
  readRoom(accountId: AccountId, documentId: DocumentId): Promise<RoomRead | null>;
  runDocumentCommand<T>(context: DocumentCommandContext, command: DocumentCommand<T>): Promise<CommandResult<T>>;
  /** Server-domain transaction; callbacks are code, never request payloads. */
  runDocumentDomainCommand<T>(context: DocumentCommandContext, command: DocumentDomainCommand<T>): Promise<CommandResult<T>>;
  createDocumentRecord(input: CreateDocumentRecordInput): Promise<DocumentStateV2>;
  /** Test/operations inspection only; never a room read endpoint. */
  inspectSnapshot(): Promise<PersistedSnapshot>;
  /** Test/backfill-only fixture ingress; no production route may call it. */
  seed(snapshot: PersistedSnapshot): Promise<void>;
}

export class PersistenceValidationError extends Error {
  override name = "PersistenceValidationError";
}

export class PersistenceInvariantError extends Error {
  override name = "PersistenceInvariantError";
}

/** Deliberately stable server error for an absent document, never a generic blob error. */
export class DocumentNotFoundError extends Error {
  readonly status = 404;
  readonly code = "document_not_found" as const;
  override name = "DocumentNotFoundError";

  constructor(documentId: string) {
    super(`document not found: ${documentId}`);
  }
}

/** Direct room membership is required before a document command can run. */
export class RoomAccessDeniedError extends Error {
  readonly status = 403;
  readonly code = "room_access_denied" as const;
  override name = "RoomAccessDeniedError";

  constructor() {
    super("direct room membership required");
  }
}

export class WorkspaceAccessDeniedError extends Error {
  readonly status = 403;
  readonly code = "workspace_access_denied" as const;
  override name = "WorkspaceAccessDeniedError";
  constructor() { super("workspace owner authority required"); }
}

export function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function validateSnapshot(snapshot: PersistedSnapshot): void {
  const accountIds = new Set<string>();
  const normalizedUsernames = new Set<string>();
  const workspaceIds = new Set<string>();
  const documentIds = new Set<string>();

  for (const account of snapshot.accounts) {
    if (!validateAccount(account) || accountIds.has(account.id)) {
      throw new PersistenceValidationError("accounts must have unique immutable ids and normalized usernames");
    }
    if (normalizedUsernames.has(account.normalizedUsername)) {
      throw new PersistenceValidationError("normalized usernames must be unique");
    }
    accountIds.add(account.id);
    normalizedUsernames.add(account.normalizedUsername);
  }
  for (const workspace of snapshot.workspaces) {
    if (!workspace.id || !workspace.name || !workspace.createdAt || !workspace.updatedAt || workspaceIds.has(workspace.id) || !accountIds.has(workspace.ownerAccountId)) {
      throw new PersistenceValidationError("workspaces must have a unique id and known owner");
    }
    workspaceIds.add(workspace.id);
  }
  const workspacePairs = new Set<string>();
  for (const membership of snapshot.workspaceMemberships) {
    const pair = `${membership.workspaceId}\u0000${membership.accountId}`;
    if (!membership.createdAt || !workspaceIds.has(membership.workspaceId) || !accountIds.has(membership.accountId) || workspacePairs.has(pair)) {
      throw new PersistenceValidationError("workspace membership references an unknown account or workspace");
    }
    if (membership.role !== "member" && membership.role !== "owner") {
      throw new PersistenceValidationError("workspace membership has an invalid role");
    }
    workspacePairs.add(pair);
  }
  for (const workspace of snapshot.workspaces) {
    const owners = snapshot.workspaceMemberships.filter((membership) => membership.workspaceId === workspace.id && membership.role === "owner");
    if (owners.length !== 1 || owners[0]!.accountId !== workspace.ownerAccountId) {
      throw new PersistenceValidationError("every workspace must retain exactly its declared owner membership");
    }
  }
  for (const state of snapshot.documents) {
    const validation = validateDocumentStateV2(state);
    if (!validation.valid) throw new PersistenceValidationError(`invalid document state: ${validation.errors.join("; ")}`);
    if (documentIds.has(state.documentId) || !workspaceIds.has(state.workspaceId)) {
      throw new PersistenceValidationError("documents must have a unique id and known workspace");
    }
    for (const version of state.versions) {
      for (const actor of [version.createdByAccountId, version.publishedByAccountId, version.lockedByAccountId]) {
        if (actor && !accountIds.has(actor)) throw new PersistenceValidationError("document version references an unknown account");
      }
    }
    for (const comment of state.comments) {
      if (!accountIds.has(comment.author)
        || comment.replies.some((reply) => !accountIds.has(reply.author))
        || comment.history.some((event) => !accountIds.has(event.who))
        || (comment.resolution && !accountIds.has(comment.resolution.resolvedBy))) {
        throw new PersistenceValidationError("comment attribution references an unknown immutable account");
      }
    }
    if (state.verdicts.some((verdict) => !accountIds.has(verdict.accountId))) {
      throw new PersistenceValidationError("verdict attribution references an unknown immutable account");
    }
    documentIds.add(state.documentId);
  }
  const roomPairs = new Set<string>();
  for (const membership of snapshot.roomMemberships) {
    const pair = `${membership.documentId}\u0000${membership.accountId}`;
    if (!membership.createdAt || !documentIds.has(membership.documentId) || !accountIds.has(membership.accountId) || roomPairs.has(pair)) {
      throw new PersistenceValidationError("room membership references an unknown record or duplicates a membership");
    }
    if (!["viewer", "commenter", "collaborator", "owner"].includes(membership.role)) {
      throw new PersistenceValidationError("room membership has an invalid role");
    }
    roomPairs.add(pair);
  }
  for (const documentId of documentIds) {
    if (!snapshot.roomMemberships.some((membership) => membership.documentId === documentId && membership.role === "owner")) {
      throw new PersistenceValidationError("every document must retain at least one room owner");
    }
  }
  const invitationIds = new Set<string>();
  for (const invitation of snapshot.roomInvitations ?? []) {
    const status = invitation.status ?? (invitation.acceptedAt ? "accepted" : "pending");
    if (!invitation.id || invitationIds.has(invitation.id) || !documentIds.has(invitation.documentId)
      || !accountIds.has(invitation.invitedByAccountId) || !invitation.normalizedUsername
      || !["viewer", "commenter", "collaborator"].includes(invitation.role)
      || !invitation.createdAt || !invitation.expiresAt
      || !["pending", "accepted", "revoked", "expired"].includes(status)
      || (status === "accepted") !== Boolean(invitation.acceptedAt && invitation.acceptedByAccountId)) {
      throw new PersistenceValidationError("room invitation is invalid");
    }
    if (invitation.acceptedByAccountId && !accountIds.has(invitation.acceptedByAccountId)) {
      throw new PersistenceValidationError("room invitation accepts an unknown account");
    }
    invitationIds.add(invitation.id);
  }
  const workspaceInvitationIds = new Set<string>();
  for (const invitation of snapshot.workspaceInvitations ?? []) {
    const status = invitation.status ?? (invitation.acceptedAt ? "accepted" : "pending");
    if (!invitation.id || workspaceInvitationIds.has(invitation.id) || !workspaceIds.has(invitation.workspaceId)
      || !accountIds.has(invitation.invitedByAccountId) || !invitation.normalizedUsername
      || invitation.role !== "member" || !invitation.createdAt || !invitation.expiresAt
      || !["pending", "accepted", "revoked", "expired"].includes(status)
      || (status === "accepted") !== Boolean(invitation.acceptedAt && invitation.acceptedByAccountId)) {
      throw new PersistenceValidationError("workspace invitation is invalid");
    }
    if (invitation.acceptedByAccountId && !accountIds.has(invitation.acceptedByAccountId)) {
      throw new PersistenceValidationError("workspace invitation accepts an unknown account");
    }
    workspaceInvitationIds.add(invitation.id);
  }
  const metadataIds = new Set<string>();
  for (const metadata of snapshot.documentMetadata ?? []) {
    if (!documentIds.has(metadata.documentId) || metadataIds.has(metadata.documentId)
      || (metadata.archivedByAccountId && !accountIds.has(metadata.archivedByAccountId))) {
      throw new PersistenceValidationError("document metadata is invalid");
    }
    metadataIds.add(metadata.documentId);
  }
  const auditIds = new Set<string>();
  for (const event of snapshot.auditEvents ?? []) {
    if (!event.id || auditIds.has(event.id) || !accountIds.has(event.actorAccountId) || !event.occurredAt
      || (event.documentId && !documentIds.has(event.documentId))
      || (event.workspaceId && !workspaceIds.has(event.workspaceId))) {
      throw new PersistenceValidationError("audit event is invalid");
    }
    auditIds.add(event.id);
  }
  const agentRunIds = new Set<string>();
  for (const run of snapshot.agentRuns ?? []) {
    if (!run.id || agentRunIds.has(run.id) || run.kind !== "ask" || run.outcome !== "succeeded"
      || !accountIds.has(run.actorAccountId) || !documentIds.has(run.documentId) || !run.createdAt) {
      throw new PersistenceValidationError("agent run is invalid");
    }
    agentRunIds.add(run.id);
  }
}

export function roomProjection(state: DocumentStateV2, role: RoomRole): RoomRead {
  const capabilities = capabilitiesForRole(role);
  // Capabilities are a transport projection.  Never trust a stale persisted
  // capability array when membership has changed.
  return {
    state: { ...cloneValue(state), capabilities },
    role,
    capabilities,
  };
}

export function applyDocumentCommand<T>(
  current: DocumentStateV2,
  context: DocumentCommandContext,
  command: DocumentCommand<T>,
): CommandResult<T> {
  const revision = checkExpectedRevision(current.revision, context.expectedRevision);
  if (!revision.ok) return { ok: false, ...revision.conflict };

  const next = command(cloneValue(current));
  if (next.state.documentId !== current.documentId || next.state.workspaceId !== current.workspaceId) {
    throw new PersistenceInvariantError("a document command cannot move a document between identities or workspaces");
  }
  if (next.state.revision !== current.revision) {
    throw new PersistenceInvariantError("a document command must not set revision; the repository increments it once");
  }
  const revised: DocumentStateV2 = { ...cloneValue(next.state), revision: current.revision + 1 };
  const validation = validateDocumentStateV2(revised);
  if (!validation.valid) throw new PersistenceValidationError(`command produced invalid document state: ${validation.errors.join("; ")}`);
  return { ok: true, state: revised, value: next.value };
}

export function applyDocumentDomainCommand<T>(
  environment: DocumentDomainEnvironment,
  context: DocumentCommandContext,
  command: DocumentDomainCommand<T>,
): CommandResult<DocumentDomainMutation<T>> {
  const revision = checkExpectedRevision(environment.state.revision, context.expectedRevision);
  if (!revision.ok) return { ok: false, ...revision.conflict };
  const mutation = command(cloneValue(environment));
  if (mutation.state.documentId !== environment.state.documentId || mutation.state.workspaceId !== environment.state.workspaceId) {
    throw new PersistenceInvariantError("a document command cannot move a document between identities or workspaces");
  }
  if (mutation.state.revision !== environment.state.revision) {
    throw new PersistenceInvariantError("a document command must not set revision; the repository increments it once");
  }
  const revised = { ...cloneValue(mutation.state), revision: environment.state.revision + 1 };
  const validation = validateDocumentStateV2(revised);
  if (!validation.valid) throw new PersistenceValidationError(`command produced invalid document state: ${validation.errors.join("; ")}`);
  return { ok: true, state: revised, value: { ...cloneValue(mutation), state: revised } };
}
