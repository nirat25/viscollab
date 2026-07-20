import { randomUUID } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import {
  fingerprintSemanticArtifact,
  currentVisualPlan,
  isUuid,
  migrateLegacyDocumentState,
  normalizeUsername,
  validateDocumentStateV2,
  type Account,
  type AccountId,
  type CommentThreadSnapshot,
  type DocumentId,
  type DocumentStateV2,
  type DocumentVersionSnapshot,
  type RoomRole,
  type SessionIdentity,
  type WorkspaceId,
  type WorkspaceMembership,
  type RoomMembership,
} from "htmlcollab-app/persistence";
import {
  applyDocumentDomainCommand,
  applyDocumentCommand,
  cloneValue,
  DocumentNotFoundError,
  PersistenceInvariantError,
  PersistenceValidationError,
  RoomAccessDeniedError,
  roomProjection,
  validateSnapshot,
  type CommandResult,
  type DocumentCommand,
  type DocumentCommandContext,
  type DocumentDomainCommand,
  type DocumentListItem,
  type PersistedSnapshot,
  type PersistenceRepository,
  type RoomRead,
  type CreateDocumentRecordInput,
  type DocumentDomainMutation,
  type RoomInvitationRecord,
  type DocumentMetadataRecord,
  type AuditEventRecord,
  type AgentRunRecord,
  WorkspaceAccessDeniedError,
  type WorkspaceRecord,
  type WorkspaceMemberRecord,
  type RoomMemberRecord,
  type WorkspaceInvitationRecord,
} from "./repository";
import { assertMigrationLedger, expectedMigrationChecksums, type MigrationChecksum, type SqlQueryable } from "./startup";
import {
  assertCutoverReadSafety,
  assertMutationMirrorSafety,
  cutoverStateFromRow,
  legacyMirrorChecksum,
  legacyMirrorProjection,
  legacyUsersProjection,
  legacyWorkspacesProjection,
  PersistenceCutoverError,
  remapLegacyReviewIdentities,
  type PersistenceCutoverState,
} from "./cutover";

type SqlRow = QueryResultRow & Record<string, unknown>;
type TransactionClient = Pick<PoolClient, "query">;
type PoolLike = SqlQueryable & { connect(): Promise<PoolClient>; end?: () => Promise<void> };

function asIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.valueOf())) throw new PersistenceValidationError("database returned an invalid timestamp");
  return date.toISOString();
}

function asMillis(value: unknown): number { return new Date(asIso(value)).valueOf(); }
function asJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* fall through */ }
  }
  return {};
}
function asJson(value: unknown): unknown { return typeof value === "string" ? JSON.parse(value) : value; }
function stringValue(value: unknown, fallback = ""): string { return typeof value === "string" ? value : fallback; }
function optionalIso(value: unknown): string | undefined { return value === null || value === undefined ? undefined : asIso(value); }
function nullableJson(value: unknown): unknown { return value === null || value === undefined ? null : JSON.stringify(value); }

function toAccount(row: SqlRow): Account {
  const storedHash = stringValue(row.password_hash);
  const salt = stringValue(row.password_salt);
  return {
    id: stringValue(row.id), username: stringValue(row.username), normalizedUsername: stringValue(row.username_normalized),
    // Legacy imports stored the salt separately. The account projection stays
    // server-only but normalizes it to the current self-contained verifier
    // format; no session or API response can observe it.
    passwordHash: storedHash.startsWith("scrypt-v1$") ? storedHash : (salt ? `scrypt-v1$${salt}$${storedHash}` : storedHash),
    createdAt: asIso(row.created_at), updatedAt: asIso(row.updated_at),
  };
}

function databaseSsl(environment: NodeJS.ProcessEnv): false | { rejectUnauthorized: boolean } {
  const mode = environment.DATABASE_SSL_MODE ?? new URL(environment.DATABASE_URL!).searchParams.get("sslmode") ?? "disable";
  return mode === "disable" ? false : { rejectUnauthorized: mode === "verify-full" };
}

export function createPostgresPoolFromEnvironment(environment: NodeJS.ProcessEnv = process.env): Pool {
  if (!environment.DATABASE_URL) throw new PersistenceInvariantError("DATABASE_URL is required for Postgres persistence");
  return new Pool({ connectionString: environment.DATABASE_URL, ssl: databaseSsl(environment) });
}

/**
 * Normalized Postgres adapter. It deliberately has no CREATE/ALTER SQL: the
 * migration CLI owns schema changes and `assertReady` only reads the ledger.
 */
export class PostgresPersistenceRepository implements PersistenceRepository {
  constructor(
    private readonly pool: PoolLike,
    private readonly migrationManifest: readonly MigrationChecksum[] = expectedMigrationChecksums(),
  ) {}

  async assertReady(): Promise<void> {
    await assertMigrationLedger(this.pool, this.migrationManifest);
    // Read and validate the operational cutover state during startup.  Reads
    // reload it below as well so an operator rollback takes effect without a
    // process restart, but an unsafe deployment never starts serving traffic.
    await this.cutoverState(this.pool);
  }

  async close(): Promise<void> { await this.pool.end?.(); }

  async getAccount(accountId: AccountId): Promise<Account | null> {
    const result = await this.pool.query<SqlRow>(
      "SELECT id::text, username, username_normalized, password_hash, password_salt, created_at, updated_at FROM accounts WHERE id = $1",
      [accountId],
    );
    return result.rows[0] ? toAccount(result.rows[0]) : null;
  }

  async getAccountByNormalizedUsername(normalizedUsername: string): Promise<Account | null> {
    const result = await this.pool.query<SqlRow>(
      "SELECT id::text, username, username_normalized, password_hash, password_salt, created_at, updated_at FROM accounts WHERE username_normalized = $1",
      [normalizedUsername],
    );
    return result.rows[0] ? toAccount(result.rows[0]) : null;
  }

  async getSessionIdentity(accountId: AccountId): Promise<SessionIdentity | null> {
    const result = await this.pool.query<SqlRow>("SELECT id::text, username FROM accounts WHERE id = $1", [accountId]);
    return result.rows[0] ? { accountId: stringValue(result.rows[0].id), username: stringValue(result.rows[0].username) } : null;
  }

  async createAccount(account: Account): Promise<Account> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cutover = await this.cutoverState(client);
      assertMutationMirrorSafety(cutover);
      const result = await client.query<SqlRow>(
        `INSERT INTO accounts (id, username, username_normalized, password_hash, password_salt, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id::text, username, username_normalized, password_hash, password_salt, created_at, updated_at`,
        // Current hashes are self-contained (scrypt-v1$<salt>$<digest>). Keep
        // that representation normalized; the mirror splits it for the old verifier.
        [account.id, account.username, account.normalizedUsername, account.passwordHash, "", account.createdAt, account.updatedAt],
      );
      if (!result.rows[0]) throw new PersistenceValidationError("account registration failed");
      await this.mirrorLegacyAccounts(client, cutover);
      await client.query("COMMIT");
      return toAccount(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async listWorkspaces(accountId: AccountId): Promise<readonly WorkspaceRecord[]> {
    const result = await this.pool.query<SqlRow>(
      `SELECT w.id::text, w.name, w.owner_account_id::text, w.created_at, w.updated_at
       FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.account_id = $1 ORDER BY w.updated_at DESC, w.id`,
      [accountId],
    );
    return result.rows.map((row) => ({ id: stringValue(row.id), name: stringValue(row.name), ownerAccountId: stringValue(row.owner_account_id), createdAt: asIso(row.created_at), updatedAt: asIso(row.updated_at) }));
  }

  async createWorkspace(input: { accountId: AccountId; workspace: WorkspaceRecord; ownerMembership: WorkspaceMembership }): Promise<WorkspaceRecord> {
    const { workspace, ownerMembership } = input;
    if (workspace.ownerAccountId !== input.accountId || ownerMembership.workspaceId !== workspace.id
      || ownerMembership.accountId !== input.accountId || ownerMembership.role !== "owner") {
      throw new PersistenceValidationError("invalid workspace create command");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cutover = await this.cutoverState(client);
      assertMutationMirrorSafety(cutover);
      const account = await client.query<SqlRow>("SELECT id::text FROM accounts WHERE id = $1 FOR KEY SHARE", [input.accountId]);
      if (!account.rows[0]) throw new WorkspaceAccessDeniedError();
      await client.query(
        "INSERT INTO workspaces (id, legacy_source_key, name, owner_account_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [workspace.id, `legacy:workspace:${workspace.id}`, workspace.name, input.accountId, workspace.createdAt, workspace.updatedAt],
      );
      await client.query(
        "INSERT INTO workspace_members (workspace_id, account_id, role, created_at) VALUES ($1, $2, 'owner'::workspace_role, $3)",
        [workspace.id, input.accountId, ownerMembership.createdAt],
      );
      await this.mirrorLegacyWorkspaces(client, cutover);
      await this.insertAuditEvent(client, this.workspaceAudit("workspace.created", input.accountId, workspace.id));
      await client.query("COMMIT");
      return cloneValue(workspace);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async listWorkspaceMembers(accountId: AccountId, workspaceId: WorkspaceId): Promise<readonly WorkspaceMemberRecord[]> {
    const result = await this.pool.query<SqlRow>(
      `SELECT a.id::text, a.username, wm.role::text, wm.created_at
       FROM workspace_members requester
       JOIN workspace_members wm ON wm.workspace_id = requester.workspace_id
       JOIN accounts a ON a.id = wm.account_id
       WHERE requester.workspace_id = $1 AND requester.account_id = $2
       ORDER BY wm.created_at, a.id`, [workspaceId, accountId],
    );
    if (!result.rows.length) {
      const exists = await this.pool.query<SqlRow>("SELECT id FROM workspaces WHERE id = $1", [workspaceId]);
      if (!exists.rows[0]) throw new DocumentNotFoundError(workspaceId);
      throw new WorkspaceAccessDeniedError();
    }
    return result.rows.map((row) => ({ workspaceId, id: stringValue(row.id), username: stringValue(row.username), role: row.role as WorkspaceMembership["role"], createdAt: asIso(row.created_at) }));
  }

  async addWorkspaceMember(input: { accountId: AccountId; workspaceId: WorkspaceId; targetAccountId: AccountId; role: "member" }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cutover = await this.cutoverState(client);
      assertMutationMirrorSafety(cutover);
      const workspace = await client.query<SqlRow>("SELECT owner_account_id::text FROM workspaces WHERE id = $1 FOR UPDATE", [input.workspaceId]);
      if (workspace.rows[0]?.owner_account_id !== input.accountId) throw new WorkspaceAccessDeniedError();
      const target = await client.query<SqlRow>("SELECT id::text FROM accounts WHERE id = $1 FOR KEY SHARE", [input.targetAccountId]);
      if (!target.rows[0]) throw new PersistenceValidationError("target account does not exist");
      await client.query("INSERT INTO workspace_members (workspace_id, account_id, role) VALUES ($1, $2, 'member'::workspace_role)", [input.workspaceId, input.targetAccountId]);
      await this.mirrorLegacyWorkspaces(client, cutover);
      await this.insertAuditEvent(client, this.workspaceAudit("workspace.member_added", input.accountId, input.workspaceId, { targetAccountId: input.targetAccountId }));
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  }

  async createWorkspaceInvitation(input: { accountId: AccountId; workspaceId: WorkspaceId; invitation: WorkspaceInvitationRecord }): Promise<WorkspaceInvitationRecord> {
    const invitation = input.invitation;
    if (invitation.workspaceId !== input.workspaceId || invitation.invitedByAccountId !== input.accountId || invitation.role !== "member" || !invitation.normalizedUsername || new Date(invitation.expiresAt).valueOf() <= Date.now()) throw new PersistenceValidationError("invalid workspace invitation");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cutover = await this.cutoverState(client);
      assertMutationMirrorSafety(cutover);
      const workspace = await client.query<SqlRow>("SELECT owner_account_id::text FROM workspaces WHERE id = $1 FOR UPDATE", [input.workspaceId]);
      if (workspace.rows[0]?.owner_account_id !== input.accountId) throw new WorkspaceAccessDeniedError();
      const existing = await client.query<SqlRow>("SELECT id FROM workspace_invitations WHERE workspace_id = $1 AND invitee_username_normalized = $2 AND status = 'pending' FOR UPDATE", [input.workspaceId, invitation.normalizedUsername]);
      if (existing.rows[0]) throw new PersistenceValidationError("an active workspace invitation already exists");
      await client.query("INSERT INTO workspace_invitations (id, workspace_id, invitee_username_normalized, intended_role, status, invited_by_account_id, expires_at, created_at, updated_at) VALUES ($1, $2, $3, 'member'::workspace_role, 'pending'::invitation_status, $4, $5, $6, $6)", [invitation.id, input.workspaceId, invitation.normalizedUsername, input.accountId, invitation.expiresAt, invitation.createdAt]);
      await this.mirrorLegacyWorkspaces(client, cutover);
      await this.insertAuditEvent(client, this.workspaceAudit("workspace.member_invited", input.accountId, input.workspaceId, { invitationId: invitation.id }));
      await client.query("COMMIT");
      return cloneValue(invitation);
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  }

  async acceptWorkspaceInvitation(input: { accountId: AccountId; workspaceId: WorkspaceId; invitationId: string }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cutover = await this.cutoverState(client);
      assertMutationMirrorSafety(cutover);
      const account = await client.query<SqlRow>("SELECT username_normalized FROM accounts WHERE id = $1 FOR KEY SHARE", [input.accountId]);
      const invite = await client.query<SqlRow>("SELECT invitee_username_normalized, expires_at, status::text FROM workspace_invitations WHERE id = $1 AND workspace_id = $2 FOR UPDATE", [input.invitationId, input.workspaceId]);
      const row = invite.rows[0];
      if (!account.rows[0] || !row || row.status !== "pending" || stringValue(row.invitee_username_normalized) !== stringValue(account.rows[0].username_normalized) || new Date(asIso(row.expires_at)).valueOf() <= Date.now()) throw new WorkspaceAccessDeniedError();
      await client.query("INSERT INTO workspace_members (workspace_id, account_id, role) VALUES ($1, $2, 'member'::workspace_role) ON CONFLICT (workspace_id, account_id) DO NOTHING", [input.workspaceId, input.accountId]);
      await client.query("UPDATE workspace_invitations SET status = 'accepted'::invitation_status, accepted_by_account_id = $1, updated_at = now() WHERE id = $2", [input.accountId, input.invitationId]);
      await this.mirrorLegacyWorkspaces(client, cutover);
      await this.insertAuditEvent(client, this.workspaceAudit("workspace.invitation_accepted", input.accountId, input.workspaceId, { invitationId: input.invitationId }));
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  }

  async revokeWorkspaceInvitation(input: { accountId: AccountId; workspaceId: WorkspaceId; invitationId: string }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cutover = await this.cutoverState(client);
      assertMutationMirrorSafety(cutover);
      const workspace = await client.query<SqlRow>("SELECT owner_account_id::text FROM workspaces WHERE id = $1 FOR UPDATE", [input.workspaceId]);
      if (workspace.rows[0]?.owner_account_id !== input.accountId) throw new WorkspaceAccessDeniedError();
      const updated = await client.query<SqlRow>("UPDATE workspace_invitations SET status = 'revoked'::invitation_status, updated_at = now() WHERE id = $1 AND workspace_id = $2 AND status = 'pending'::invitation_status RETURNING id", [input.invitationId, input.workspaceId]);
      if (!updated.rows[0]) throw new PersistenceValidationError("invitation unavailable");
      await this.mirrorLegacyWorkspaces(client, cutover);
      await this.insertAuditEvent(client, this.workspaceAudit("workspace.invitation_revoked", input.accountId, input.workspaceId, { invitationId: input.invitationId }));
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  }

  async removeWorkspaceMember(input: { accountId: AccountId; workspaceId: WorkspaceId; targetAccountId: AccountId }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cutover = await this.cutoverState(client);
      assertMutationMirrorSafety(cutover);
      const workspace = await client.query<SqlRow>("SELECT owner_account_id::text FROM workspaces WHERE id = $1 FOR UPDATE", [input.workspaceId]);
      if (workspace.rows[0]?.owner_account_id !== input.accountId) throw new WorkspaceAccessDeniedError();
      if (input.targetAccountId === input.accountId) throw new PersistenceValidationError("workspace owner cannot be removed");
      const deleted = await client.query<SqlRow>("DELETE FROM workspace_members WHERE workspace_id = $1 AND account_id = $2 RETURNING account_id", [input.workspaceId, input.targetAccountId]);
      if (!deleted.rows[0]) throw new PersistenceValidationError("workspace member not found");
      await this.mirrorLegacyWorkspaces(client, cutover);
      await this.insertAuditEvent(client, this.workspaceAudit("workspace.member_removed", input.accountId, input.workspaceId, { targetAccountId: input.targetAccountId }));
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  }

  async listDocuments(accountId: AccountId, workspaceId?: WorkspaceId): Promise<readonly DocumentListItem[]> {
    const values: unknown[] = [accountId];
    const workspaceClause = workspaceId ? " AND d.workspace_id = $2" : "";
    if (workspaceId) values.push(workspaceId);
    const result = await this.pool.query<SqlRow>(
      `SELECT d.id::text, d.workspace_id::text, d.title, d.kind::text, d.revision, d.active_version_number
       FROM documents d JOIN room_members rm ON rm.document_id = d.id
       WHERE rm.account_id = $1${workspaceClause} AND d.archived_at IS NULL
       ORDER BY d.updated_at DESC, d.id`, values,
    );
    return result.rows.map((row) => ({ id: stringValue(row.id), workspaceId: stringValue(row.workspace_id), title: stringValue(row.title), kind: row.kind as DocumentStateV2["kind"], revision: Number(row.revision), activeVersionNumber: Number(row.active_version_number) }));
  }

  async getRoomRole(accountId: AccountId, documentId: DocumentId): Promise<RoomRole | null> {
    const result = await this.pool.query<SqlRow>("SELECT role::text FROM room_members WHERE account_id = $1 AND document_id = $2", [accountId, documentId]);
    const role = result.rows[0]?.role;
    return role === "viewer" || role === "commenter" || role === "collaborator" || role === "owner" ? role : null;
  }

  async listRoomMembers(accountId: AccountId, documentId: DocumentId): Promise<readonly RoomMemberRecord[]> {
    const result = await this.pool.query<SqlRow>(
      `SELECT a.id::text, a.username, rm.role::text, rm.created_at
       FROM room_members requester JOIN room_members rm ON rm.document_id = requester.document_id
       JOIN accounts a ON a.id = rm.account_id
       WHERE requester.document_id = $1 AND requester.account_id = $2
       ORDER BY rm.created_at, a.id`, [documentId, accountId],
    );
    if (!result.rows.length) {
      const exists = await this.pool.query<SqlRow>("SELECT id FROM documents WHERE id = $1", [documentId]);
      if (!exists.rows[0]) throw new DocumentNotFoundError(documentId);
      throw new RoomAccessDeniedError();
    }
    return result.rows.map((row) => ({ documentId, id: stringValue(row.id), username: stringValue(row.username), role: row.role as RoomRole, createdAt: asIso(row.created_at) }));
  }

  async acceptRoomInvitation(input: { accountId: AccountId; documentId: DocumentId; invitationId: string; expectedRevision: number }): Promise<CommandResult<RoomInvitationRecord>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cutover = await this.cutoverState(client);
      const state = cutover.readMode === "blob"
        ? await this.loadVerifiedBlobMirror(client, input.documentId, true)
        : await this.loadDocumentState(client, input.documentId, true);
      if (!state) throw new DocumentNotFoundError(input.documentId);
      if (state.revision !== input.expectedRevision) { await client.query("ROLLBACK"); return { ok: false, status: 409, code: "revision_conflict", currentRevision: state.revision }; }
      const account = await client.query<SqlRow>("SELECT username_normalized FROM accounts WHERE id = $1 FOR KEY SHARE", [input.accountId]);
      const invite = await client.query<SqlRow>(`SELECT id::text, invitee_username_normalized, intended_role::text, invited_by_account_id::text, created_at, expires_at, status::text
        FROM room_invitations WHERE id = $1 AND document_id = $2 FOR UPDATE`, [input.invitationId, input.documentId]);
      const row = invite.rows[0];
      if (!account.rows[0] || !row || row.status !== "pending" || stringValue(row.invitee_username_normalized) !== stringValue(account.rows[0].username_normalized) || new Date(asIso(row.expires_at)).valueOf() <= Date.now()) throw new RoomAccessDeniedError();
      const membership = await client.query<SqlRow>("SELECT 1 FROM room_members WHERE document_id = $1 AND account_id = $2", [input.documentId, input.accountId]);
      if (membership.rows[0]) throw new PersistenceValidationError("already a room member");
      const updated = await client.query<SqlRow>("UPDATE documents SET revision = revision + 1, updated_at = now() WHERE id = $1 AND revision = $2 RETURNING revision", [input.documentId, input.expectedRevision]);
      if (!updated.rows[0]) { await client.query("ROLLBACK"); return { ok: false, status: 409, code: "revision_conflict", currentRevision: state.revision }; }
      await client.query("INSERT INTO room_members (document_id, account_id, role) VALUES ($1, $2, $3::room_role)", [input.documentId, input.accountId, row.intended_role]);
      await client.query("UPDATE room_invitations SET status = 'accepted'::invitation_status, accepted_by_account_id = $1, updated_at = now() WHERE id = $2", [input.accountId, input.invitationId]);
      const now = new Date().toISOString();
      await client.query("INSERT INTO audit_events (id, actor_account_id, workspace_id, document_id, event_type, safe_metadata, created_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)", [`invite-accepted-${input.invitationId}`, input.accountId, state.workspaceId, input.documentId, "member.invitation_accepted", JSON.stringify({ invitationId: input.invitationId }), now]);
      await this.mirrorNormalizedMutation(client, { ...state, revision: Number(updated.rows[0].revision) }, cutover);
      await client.query("COMMIT");
      const accepted: RoomInvitationRecord = { id: stringValue(row.id), documentId: input.documentId, normalizedUsername: stringValue(row.invitee_username_normalized), role: row.intended_role as Exclude<RoomRole, "owner">, invitedByAccountId: stringValue(row.invited_by_account_id), createdAt: asIso(row.created_at), expiresAt: asIso(row.expires_at), acceptedAt: now, acceptedByAccountId: input.accountId };
      return { ok: true, state: { ...state, revision: Number(updated.rows[0].revision) }, value: accepted };
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  }

  async revokeRoomInvitation(input: { accountId: AccountId; documentId: DocumentId; invitationId: string; expectedRevision: number }): Promise<CommandResult<RoomInvitationRecord>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cutover = await this.cutoverState(client);
      const state = cutover.readMode === "blob"
        ? await this.loadVerifiedBlobMirror(client, input.documentId, true)
        : await this.loadDocumentState(client, input.documentId, true);
      if (!state) throw new DocumentNotFoundError(input.documentId);
      if (state.revision !== input.expectedRevision) { await client.query("ROLLBACK"); return { ok: false, status: 409, code: "revision_conflict", currentRevision: state.revision }; }
      const owner = await client.query<SqlRow>("SELECT 1 FROM room_members WHERE document_id = $1 AND account_id = $2 AND role = 'owner'::room_role", [input.documentId, input.accountId]);
      if (!owner.rows[0]) throw new RoomAccessDeniedError();
      const invite = await client.query<SqlRow>("UPDATE room_invitations SET status = 'revoked'::invitation_status, updated_at = now() WHERE id = $1 AND document_id = $2 AND status = 'pending'::invitation_status RETURNING id::text, invitee_username_normalized, intended_role::text, invited_by_account_id::text, created_at, expires_at", [input.invitationId, input.documentId]);
      const row = invite.rows[0]; if (!row) throw new PersistenceValidationError("invitation unavailable");
      const revision = await client.query<SqlRow>("UPDATE documents SET revision = revision + 1, updated_at = now() WHERE id = $1 AND revision = $2 RETURNING revision", [input.documentId, input.expectedRevision]);
      if (!revision.rows[0]) { await client.query("ROLLBACK"); return { ok: false, status: 409, code: "revision_conflict", currentRevision: state.revision }; }
      await this.mirrorNormalizedMutation(client, { ...state, revision: Number(revision.rows[0].revision) }, cutover);
      await client.query("COMMIT");
      return { ok: true, state: { ...state, revision: Number(revision.rows[0].revision) }, value: { id: stringValue(row.id), documentId: input.documentId, normalizedUsername: stringValue(row.invitee_username_normalized), role: row.intended_role as Exclude<RoomRole, "owner">, invitedByAccountId: stringValue(row.invited_by_account_id), createdAt: asIso(row.created_at), expiresAt: asIso(row.expires_at), status: "revoked" } };
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  }

  async readRoom(accountId: AccountId, documentId: DocumentId): Promise<RoomRead | null> {
    const role = await this.getRoomRole(accountId, documentId);
    if (!role) return null;
    const cutover = await this.cutoverState(this.pool);
    const state = cutover.readMode === "blob"
      ? await this.loadVerifiedBlobMirror(this.pool, documentId, false)
      : await this.loadDocumentState(this.pool, documentId, false);
    return state ? roomProjection(state, role) : null;
  }

  async runDocumentCommand<T>(context: DocumentCommandContext, command: DocumentCommand<T>): Promise<CommandResult<T>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cutover = await this.cutoverState(client);
      const state = cutover.readMode === "blob"
        ? await this.loadVerifiedBlobMirror(client, context.documentId, true)
        : await this.loadDocumentState(client, context.documentId, true);
      if (!state) throw new DocumentNotFoundError(context.documentId);
      const membership = await client.query<SqlRow>("SELECT role::text FROM room_members WHERE document_id = $1 AND account_id = $2", [context.documentId, context.accountId]);
      if (!membership.rows[0]) throw new RoomAccessDeniedError();
      const result = applyDocumentCommand(state, context, command);
      if (!result.ok) { await client.query("ROLLBACK"); return result; }
      const update = await client.query<SqlRow>(
        `UPDATE documents SET title = $1, kind = $2::document_kind, active_version_number = $3,
         revision = revision + 1, updated_at = now() WHERE id = $4 AND revision = $5 RETURNING revision`,
        [result.state.title, result.state.kind, result.state.activeVersionNumber, context.documentId, context.expectedRevision],
      );
      if (!update.rows[0]) { await client.query("ROLLBACK"); return { ok: false, status: 409, code: "revision_conflict", currentRevision: state.revision }; }
      await this.replaceProjection(client, result.state);
      await this.mirrorNormalizedMutation(client, result.state, cutover);
      await client.query("COMMIT");
      return cloneValue(result);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async runDocumentDomainCommand<T>(context: DocumentCommandContext, command: DocumentDomainCommand<T>): Promise<CommandResult<T>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cutover = await this.cutoverState(client);
      const state = cutover.readMode === "blob"
        ? await this.loadVerifiedBlobMirror(client, context.documentId, true)
        : await this.loadDocumentState(client, context.documentId, true);
      if (!state) throw new DocumentNotFoundError(context.documentId);
      const memberships = await this.loadRoomMemberships(client, context.documentId);
      const actorRole = memberships.find((membership) => membership.accountId === context.accountId)?.role;
      if (!actorRole) throw new RoomAccessDeniedError();
      const invitations = await this.loadRoomInvitations(client, context.documentId);
      const metadata = await this.loadMetadata(client, context.documentId);
      const result = applyDocumentDomainCommand({ state, actorRole, roomMemberships: memberships, roomInvitations: invitations, metadata }, context, command);
      if (!result.ok) { await client.query("ROLLBACK"); return result; }
      const mutation = result.value;
      this.assertDomainSideEffects(context, state.workspaceId, mutation);
      const update = await client.query<SqlRow>(
        `UPDATE documents SET title = $1, kind = $2::document_kind, active_version_number = $3, revision = revision + 1, updated_at = now()
         WHERE id = $4 AND revision = $5 RETURNING revision`,
        [result.state.title, result.state.kind, result.state.activeVersionNumber, context.documentId, context.expectedRevision],
      );
      if (!update.rows[0]) { await client.query("ROLLBACK"); return { ok: false, status: 409, code: "revision_conflict", currentRevision: state.revision }; }
      await this.replaceProjection(client, result.state);
      if (mutation.roomMemberships) await this.replaceRoomMemberships(client, context.documentId, mutation.roomMemberships);
      if (mutation.roomInvitations) await this.replaceRoomInvitations(client, context.documentId, mutation.roomInvitations);
      if (mutation.metadata) await client.query("UPDATE documents SET archived_at = $1, archived_by_account_id = $2 WHERE id = $3", [mutation.metadata.archivedAt ?? null, mutation.metadata.archivedByAccountId ?? null, context.documentId]);
      for (const event of mutation.auditEvents ?? []) await this.insertAuditEvent(client, event);
      for (const run of mutation.agentRuns ?? []) await this.insertAgentRun(client, run);
      await this.mirrorNormalizedMutation(client, result.state, cutover);
      await client.query("COMMIT");
      return cloneValue({ ok: true, state: result.state, value: mutation.value });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createDocumentRecord(input: CreateDocumentRecordInput): Promise<DocumentStateV2> {
    const validation = validateDocumentStateV2(input.state);
    if (!validation.valid) throw new PersistenceValidationError(`invalid document state: ${validation.errors.join("; ")}`);
    if (input.state.workspaceId !== input.workspaceId || input.state.revision !== 0
      || input.ownerMembership.documentId !== input.state.documentId || input.ownerMembership.accountId !== input.accountId
      || input.ownerMembership.role !== "owner" || input.auditEvent.actorAccountId !== input.accountId
      || input.auditEvent.documentId !== input.state.documentId || input.auditEvent.workspaceId !== input.workspaceId) {
      throw new PersistenceValidationError("create document command has inconsistent identities");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const workspace = await client.query<SqlRow>("SELECT owner_account_id::text FROM workspaces WHERE id = $1 FOR UPDATE", [input.workspaceId]);
      if (workspace.rows[0]?.owner_account_id !== input.accountId) throw new WorkspaceAccessDeniedError();
      await client.query(
        "INSERT INTO documents (id, workspace_id, kind, title, active_version_number, revision) VALUES ($1, $2, $3::document_kind, $4, $5, 0)",
        [input.state.documentId, input.workspaceId, input.state.kind, input.state.title, input.state.activeVersionNumber],
      );
      await client.query("INSERT INTO room_members (document_id, account_id, role, created_at) VALUES ($1, $2, 'owner'::room_role, $3)", [input.state.documentId, input.accountId, input.ownerMembership.createdAt]);
      await this.replaceProjection(client, input.state);
      await this.insertAuditEvent(client, input.auditEvent);
      await this.mirrorNormalizedMutation(client, input.state, await this.cutoverState(client));
      await client.query("COMMIT");
      return cloneValue(input.state);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async inspectSnapshot(): Promise<PersistedSnapshot> {
    const [accountsResult, workspacesResult, workspaceMembersResult, documentsResult, roomMembersResult, invitationResult, auditResult, runsResult] = await Promise.all([
      this.pool.query<SqlRow>("SELECT id::text, username, username_normalized, password_hash, created_at, updated_at FROM accounts ORDER BY id"),
      this.pool.query<SqlRow>("SELECT id::text, name, owner_account_id::text, created_at, updated_at FROM workspaces ORDER BY id"),
      this.pool.query<SqlRow>("SELECT workspace_id::text, account_id::text, role::text, created_at FROM workspace_members ORDER BY workspace_id, account_id"),
      this.pool.query<SqlRow>("SELECT id::text FROM documents ORDER BY id"),
      this.pool.query<SqlRow>("SELECT document_id::text, account_id::text, role::text, created_at FROM room_members ORDER BY document_id, account_id"),
      this.pool.query<SqlRow>("SELECT id::text, document_id::text, invitee_username_normalized, intended_role::text, invited_by_account_id::text, created_at, expires_at, CASE WHEN status = 'accepted' THEN updated_at END AS accepted_at, accepted_by_account_id::text FROM room_invitations WHERE status <> 'revoked' ORDER BY id"),
      this.pool.query<SqlRow>("SELECT id::text, event_type, actor_account_id::text, created_at, document_id::text, workspace_id::text, safe_metadata FROM audit_events ORDER BY created_at, id"),
      this.pool.query<SqlRow>("SELECT id::text, document_id::text, actor_account_id::text, created_at, outcome, model_name, preset, artifact_fingerprint FROM agent_runs WHERE operation = 'ask' ORDER BY created_at, id"),
    ]);
    const documents = (await Promise.all(documentsResult.rows.map((row) => this.loadDocumentState(this.pool, stringValue(row.id), false)))).filter((state): state is DocumentStateV2 => state !== null);
    const metadataResult = await this.pool.query<SqlRow>("SELECT id::text, archived_at, archived_by_account_id::text FROM documents WHERE archived_at IS NOT NULL ORDER BY id");
    return {
      accounts: accountsResult.rows.map(toAccount),
      workspaces: workspacesResult.rows.map((row) => ({ id: stringValue(row.id), name: stringValue(row.name), ownerAccountId: stringValue(row.owner_account_id), createdAt: asIso(row.created_at), updatedAt: asIso(row.updated_at) })),
      workspaceMemberships: workspaceMembersResult.rows.map((row) => ({ workspaceId: stringValue(row.workspace_id), accountId: stringValue(row.account_id), role: row.role === "owner" ? "owner" : "member", createdAt: asIso(row.created_at) })),
      roomMemberships: roomMembersResult.rows.map((row) => ({ documentId: stringValue(row.document_id), accountId: stringValue(row.account_id), role: row.role as RoomRole, createdAt: asIso(row.created_at) })),
      documents,
      roomInvitations: invitationResult.rows.map((row) => ({ id: stringValue(row.id), documentId: stringValue(row.document_id), normalizedUsername: stringValue(row.invitee_username_normalized), role: row.intended_role as Exclude<RoomRole, "owner">, invitedByAccountId: stringValue(row.invited_by_account_id), createdAt: asIso(row.created_at), expiresAt: asIso(row.expires_at), ...(row.accepted_at ? { acceptedAt: asIso(row.accepted_at), acceptedByAccountId: stringValue(row.accepted_by_account_id) } : {}) })),
      documentMetadata: metadataResult.rows.map((row) => ({ documentId: stringValue(row.id), archivedAt: asIso(row.archived_at), archivedByAccountId: stringValue(row.archived_by_account_id) })),
      auditEvents: auditResult.rows.map((row) => ({ id: stringValue(row.id), type: row.event_type as AuditEventRecord["type"], actorAccountId: stringValue(row.actor_account_id), occurredAt: asIso(row.created_at), ...(row.document_id ? { documentId: stringValue(row.document_id) } : {}), ...(row.workspace_id ? { workspaceId: stringValue(row.workspace_id) } : {}), metadata: asJsonObject(row.safe_metadata) as Readonly<Record<string, string | number | boolean | null>> })),
      agentRuns: runsResult.rows.map((row) => ({ id: stringValue(row.id), kind: "ask", actorAccountId: stringValue(row.actor_account_id), documentId: stringValue(row.document_id), createdAt: asIso(row.created_at), outcome: "succeeded", ...(row.model_name ? { model: stringValue(row.model_name) } : {}), ...(row.preset ? { preset: stringValue(row.preset) } : {}), ...(row.artifact_fingerprint ? { semanticArtifactFingerprint: stringValue(row.artifact_fingerprint) } : {}) })),
    };
  }

  /** Fixture/backfill ingress only. HTTP routes must never expose it. */
  async seed(snapshot: PersistedSnapshot): Promise<void> {
    validateSnapshot(snapshot);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // This is intentionally a deterministic fixture importer, not a request-path upsert API.
      for (const account of snapshot.accounts) {
        await client.query(
          `INSERT INTO accounts (id, username, username_normalized, password_hash, password_salt, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, username_normalized = EXCLUDED.username_normalized,
             password_hash = EXCLUDED.password_hash, updated_at = EXCLUDED.updated_at`,
          [account.id, account.username, account.normalizedUsername, account.passwordHash, "managed-outside-projection", account.createdAt, account.updatedAt],
        );
      }
      for (const workspace of snapshot.workspaces) {
        await client.query(
          `INSERT INTO workspaces (id, name, owner_account_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, owner_account_id = EXCLUDED.owner_account_id, updated_at = EXCLUDED.updated_at`,
          [workspace.id, workspace.name, workspace.ownerAccountId, workspace.createdAt, workspace.updatedAt],
        );
      }
      for (const membership of snapshot.workspaceMemberships) {
        await client.query(
          `INSERT INTO workspace_members (workspace_id, account_id, role, created_at) VALUES ($1, $2, $3::workspace_role, $4)
           ON CONFLICT (workspace_id, account_id) DO UPDATE SET role = EXCLUDED.role`,
          [membership.workspaceId, membership.accountId, membership.role, membership.createdAt],
        );
      }
      for (const state of snapshot.documents) {
        await client.query(
          `INSERT INTO documents (id, workspace_id, kind, title, active_version_number, revision) VALUES ($1, $2, $3::document_kind, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET workspace_id = EXCLUDED.workspace_id, kind = EXCLUDED.kind, title = EXCLUDED.title,
             active_version_number = EXCLUDED.active_version_number, revision = EXCLUDED.revision, updated_at = now()`,
          [state.documentId, state.workspaceId, state.kind, state.title, state.activeVersionNumber, state.revision],
        );
      }
      for (const membership of snapshot.roomMemberships) {
        await client.query(
          `INSERT INTO room_members (document_id, account_id, role, created_at) VALUES ($1, $2, $3::room_role, $4)
           ON CONFLICT (document_id, account_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now()`,
          [membership.documentId, membership.accountId, membership.role, membership.createdAt],
        );
      }
      for (const state of snapshot.documents) await this.replaceProjection(client, state);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async loadRoomMemberships(database: SqlQueryable, documentId: DocumentId): Promise<readonly RoomMembership[]> {
    const result = await database.query<SqlRow>("SELECT document_id::text, account_id::text, role::text, created_at FROM room_members WHERE document_id = $1 ORDER BY account_id", [documentId]);
    return result.rows.map((row) => ({ documentId: stringValue(row.document_id), accountId: stringValue(row.account_id), role: row.role as RoomRole, createdAt: asIso(row.created_at) }));
  }

  private async loadRoomInvitations(database: SqlQueryable, documentId: DocumentId): Promise<readonly RoomInvitationRecord[]> {
    const result = await database.query<SqlRow>(
      `SELECT id::text, document_id::text, invitee_username_normalized, intended_role::text, invited_by_account_id::text,
       created_at, expires_at, CASE WHEN status = 'accepted' THEN updated_at END AS accepted_at, accepted_by_account_id::text FROM room_invitations
       WHERE document_id = $1 AND status <> 'revoked' ORDER BY created_at, id`, [documentId],
    );
    return result.rows.map((row) => ({ id: stringValue(row.id), documentId: stringValue(row.document_id), normalizedUsername: stringValue(row.invitee_username_normalized), role: row.intended_role as Exclude<RoomRole, "owner">, invitedByAccountId: stringValue(row.invited_by_account_id), createdAt: asIso(row.created_at), expiresAt: asIso(row.expires_at), ...(row.accepted_at ? { acceptedAt: asIso(row.accepted_at), acceptedByAccountId: stringValue(row.accepted_by_account_id) } : {}) }));
  }

  private async loadMetadata(database: SqlQueryable, documentId: DocumentId): Promise<DocumentMetadataRecord> {
    const result = await database.query<SqlRow>("SELECT id::text, archived_at, archived_by_account_id::text FROM documents WHERE id = $1", [documentId]);
    const row = result.rows[0];
    if (!row) throw new DocumentNotFoundError(documentId);
    return { documentId: stringValue(row.id), ...(row.archived_at ? { archivedAt: asIso(row.archived_at), archivedByAccountId: stringValue(row.archived_by_account_id) } : {}) };
  }

  private assertDomainSideEffects<T>(context: DocumentCommandContext, workspaceId: WorkspaceId, mutation: DocumentDomainMutation<T>): void {
    if (mutation.roomMemberships?.some((membership) => membership.documentId !== context.documentId)
      || mutation.roomInvitations?.some((invitation) => invitation.documentId !== context.documentId)
      || (mutation.metadata && mutation.metadata.documentId !== context.documentId)) {
      throw new PersistenceValidationError("document command attempted a cross-document side effect");
    }
    if (mutation.auditEvents?.some((event) => event.actorAccountId !== context.accountId || event.documentId !== context.documentId || event.workspaceId !== workspaceId)) {
      throw new PersistenceValidationError("audit event attribution is inconsistent with the command");
    }
    if (mutation.agentRuns?.some((run) => run.actorAccountId !== context.accountId || run.documentId !== context.documentId)) {
      throw new PersistenceValidationError("agent run attribution is inconsistent with the command");
    }
  }

  private async replaceRoomMemberships(database: TransactionClient, documentId: DocumentId, memberships: readonly RoomMembership[]): Promise<void> {
    if (!memberships.some((membership) => membership.role === "owner")) throw new PersistenceValidationError("every document must retain a room owner");
    await database.query("DELETE FROM room_members WHERE document_id = $1", [documentId]);
    for (const membership of memberships) {
      await database.query("INSERT INTO room_members (document_id, account_id, role, created_at) VALUES ($1, $2, $3::room_role, $4)", [membership.documentId, membership.accountId, membership.role, membership.createdAt]);
    }
  }

  private async replaceRoomInvitations(database: TransactionClient, documentId: DocumentId, invitations: readonly RoomInvitationRecord[]): Promise<void> {
    await database.query("DELETE FROM room_invitations WHERE document_id = $1", [documentId]);
    for (const invitation of invitations) {
      await database.query(
        `INSERT INTO room_invitations (id, document_id, invitee_username_normalized, intended_role, status, invited_by_account_id,
          expires_at, accepted_by_account_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4::room_role, $5::invitation_status, $6, $7, $8, $9, $9)`,
        [invitation.id, invitation.documentId, invitation.normalizedUsername, invitation.role, invitation.acceptedAt ? "accepted" : "pending", invitation.invitedByAccountId,
          invitation.expiresAt, invitation.acceptedByAccountId ?? null, invitation.createdAt],
      );
    }
  }

  private async insertAuditEvent(database: TransactionClient, event: AuditEventRecord): Promise<void> {
    await database.query(
      `INSERT INTO audit_events (id, actor_account_id, workspace_id, document_id, event_type, safe_metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [event.id, event.actorAccountId, event.workspaceId ?? null, event.documentId ?? null, event.type, JSON.stringify(event.metadata), event.occurredAt],
    );
  }

  private async insertAgentRun(database: TransactionClient, run: AgentRunRecord): Promise<void> {
    await database.query(
      `INSERT INTO agent_runs (id, document_id, actor_account_id, operation, model_name, preset, outcome, artifact_fingerprint, created_at)
       VALUES ($1, $2, $3, 'ask', $4, $5, $6, $7, $8)`,
      [run.id, run.documentId, run.actorAccountId, run.model ?? null, run.preset ?? null, run.outcome, run.semanticArtifactFingerprint ?? null, run.createdAt],
    );
  }

  private workspaceAudit(
    type: Extract<AuditEventRecord["type"], `workspace.${string}`>,
    actorAccountId: AccountId,
    workspaceId: WorkspaceId,
    metadata: Readonly<Record<string, string | number | boolean | null>> = {},
  ): AuditEventRecord {
    return { id: randomUUID(), type, actorAccountId, workspaceId, occurredAt: new Date().toISOString(), metadata };
  }

  /** Complete token-free legacy account projection, written in the caller's transaction. */
  private async mirrorLegacyAccounts(database: TransactionClient, cutover: PersistenceCutoverState): Promise<void> {
    assertMutationMirrorSafety(cutover);
    const accounts = await database.query<SqlRow>(
      "SELECT username, password_hash, password_salt FROM accounts ORDER BY username_normalized, id",
    );
    const users = legacyUsersProjection(accounts.rows.map((row) => ({
      username: stringValue(row.username),
      passwordHash: stringValue(row.password_hash),
      passwordSalt: stringValue(row.password_salt),
    })));
    await database.query(
      `INSERT INTO collab_state (key, value) VALUES ('users', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(users)],
    );
  }

  /** Complete workspace/member/invite rollback projection; never contains access tokens. */
  private async mirrorLegacyWorkspaces(database: TransactionClient, cutover: PersistenceCutoverState): Promise<void> {
    assertMutationMirrorSafety(cutover);
    const workspaces = await database.query<SqlRow>(
        `SELECT w.id::text, w.legacy_source_key, w.name, owner.username AS owner_username
         FROM workspaces w JOIN accounts owner ON owner.id = w.owner_account_id
         ORDER BY w.id`,
      );
    const members = await database.query<SqlRow>(
        `SELECT wm.workspace_id::text, a.username, wm.role::text
         FROM workspace_members wm JOIN accounts a ON a.id = wm.account_id
         ORDER BY wm.workspace_id, wm.created_at, wm.account_id`,
      );
    const invitations = await database.query<SqlRow>(
        `SELECT id::text, workspace_id::text, invitee_username_normalized, status::text, expires_at
         FROM workspace_invitations ORDER BY workspace_id, created_at, id`,
      );
    const projection = legacyWorkspacesProjection(workspaces.rows.map((workspace) => ({
      id: stringValue(workspace.id),
      ...(workspace.legacy_source_key ? { legacySourceKey: stringValue(workspace.legacy_source_key) } : {}),
      name: stringValue(workspace.name),
      ownerUsername: stringValue(workspace.owner_username),
      members: members.rows
        .filter((member) => stringValue(member.workspace_id) === stringValue(workspace.id))
        .map((member) => ({ username: stringValue(member.username), role: member.role === "owner" ? "owner" as const : "member" as const })),
      invitations: invitations.rows
        .filter((invitation) => stringValue(invitation.workspace_id) === stringValue(workspace.id))
        .map((invitation) => ({
          id: stringValue(invitation.id),
          normalizedUsername: stringValue(invitation.invitee_username_normalized),
          status: invitation.status === "accepted" || invitation.status === "revoked" || invitation.status === "expired"
            ? invitation.status
            : "pending",
          expiresAt: asIso(invitation.expires_at),
        })),
    })));
    await database.query(
      `INSERT INTO collab_state (key, value) VALUES ('workspaces', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(projection)],
    );
  }

  /**
   * This query is deliberately independent of the migration ledger.  A clean
   * parity marker means both that parity has been recorded and that no source
   * was left with an unresolved migration issue at the time reads are cut
   * over.  Invalid/absent state is a hard deployment error, never a fallback.
   */
  private async cutoverState(database: SqlQueryable): Promise<PersistenceCutoverState> {
    const result = await database.query<SqlRow>(
      `SELECT read_mode, dual_write_enabled, last_parity_verified_at,
        NOT EXISTS (SELECT 1 FROM migration_issues WHERE status = 'open') AS parity_is_clean
       FROM persistence_cutover_state WHERE singleton = TRUE`,
    );
    const state = cutoverStateFromRow(result.rows[0]);
    assertCutoverReadSafety(state);
    return state;
  }

  private legacyDocumentId(sourceKey: string): string {
    const prefix = "legacy:document:";
    if (!sourceKey.startsWith(prefix) || !sourceKey.slice(prefix.length)) {
      throw new PersistenceCutoverError("blob mirror has an unsupported source key");
    }
    return sourceKey.slice(prefix.length);
  }

  /**
   * Blob mode is a rollback reader, not an authorization fallback.  Callers
   * have already established direct normalized room membership; this method
   * additionally insists on a matching migrated source, receipt, revision,
   * and checksum before accepting the mirrored legacy payload.
   */
  private async loadVerifiedBlobMirror(database: SqlQueryable, documentId: DocumentId, lock: boolean): Promise<DocumentStateV2 | null> {
    const document = await database.query<SqlRow>(
      `SELECT id::text, workspace_id::text, revision, title
       FROM documents WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
      [documentId],
    );
    const row = document.rows[0];
    if (!row) return null;
    const receipt = await database.query<SqlRow>(
      `SELECT ms.source_key, r.document_revision, r.blob_checksum
       FROM migration_sources ms JOIN legacy_blob_mirror_receipts r ON r.document_id = ms.document_id
       WHERE ms.document_id = $1`, [documentId],
    );
    const receiptRow = receipt.rows[0];
    if (!receiptRow || receipt.rows.length !== 1) {
      throw new PersistenceCutoverError("blob reads require a uniquely migrated document with a mirror receipt");
    }
    if (Number(receiptRow.document_revision) !== Number(row.revision)) {
      throw new PersistenceCutoverError("blob mirror receipt revision is stale; refusing rollback read");
    }
    const legacyId = this.legacyDocumentId(stringValue(receiptRow.source_key));
    const documents = await database.query<SqlRow>("SELECT value FROM collab_state WHERE key = 'documents'");
    const state = await database.query<SqlRow>("SELECT value FROM collab_state WHERE key = $1", [`doc_${legacyId}`]);
    const catalog = documents.rows[0] ? asJson(documents.rows[0].value) : undefined;
    const legacyDocument = Array.isArray(catalog)
      ? catalog.find((candidate) => asJsonObject(candidate).id === legacyId)
      : undefined;
    const legacyState = state.rows[0] ? asJson(state.rows[0].value) : undefined;
    if (!legacyDocument || legacyState === undefined) {
      throw new PersistenceCutoverError("verified blob mirror is incomplete");
    }
    if (legacyMirrorChecksum(legacyDocument, legacyState) !== stringValue(receiptRow.blob_checksum)) {
      throw new PersistenceCutoverError("blob mirror checksum mismatch; refusing rollback read");
    }
    const migrated = migrateLegacyDocumentState({
      documentId,
      workspaceId: stringValue(row.workspace_id),
      title: stringValue(row.title),
      state: legacyState,
    }).state;
    const accounts = await database.query<SqlRow>("SELECT id::text, username_normalized FROM accounts ORDER BY id");
    const owner = await database.query<SqlRow>("SELECT account_id::text FROM room_members WHERE document_id = $1 AND role = 'owner' ORDER BY account_id LIMIT 1", [documentId]);
    const projection: DocumentStateV2 = remapLegacyReviewIdentities(
      { ...migrated, revision: Number(row.revision), capabilities: [] },
      new Map(accounts.rows.map((account) => [stringValue(account.username_normalized), stringValue(account.id)])),
      legacyState,
      owner.rows[0] ? stringValue(owner.rows[0].account_id) : undefined,
    );
    const validation = validateDocumentStateV2(projection);
    if (!validation.valid) throw new PersistenceCutoverError(`blob mirror projection is invalid: ${validation.errors.join("; ")}`);
    return projection;
  }

  /**
   * Every normalized command writes the old catalog + room state and its
   * receipt before commit.  There is intentionally no catch/fallback: a
   * failed mirror rolls back the normalized command with the transaction.
   */
  private async mirrorNormalizedMutation(
    database: TransactionClient,
    state: DocumentStateV2,
    cutover: PersistenceCutoverState,
  ): Promise<void> {
    assertMutationMirrorSafety(cutover);
    const source = await database.query<SqlRow>("SELECT source_key FROM migration_sources WHERE document_id = $1", [state.documentId]);
    if (source.rows.length > 1) throw new PersistenceCutoverError("document has multiple legacy source mappings");
    const sourceKey = source.rows[0] ? stringValue(source.rows[0].source_key) : `legacy:document:${state.documentId}`;
    const legacyId = this.legacyDocumentId(sourceKey);
    const workspaceSource = await database.query<SqlRow>(
      `SELECT w.legacy_source_key FROM documents d JOIN workspaces w ON w.id = d.workspace_id
       WHERE d.id = $1`, [state.documentId],
    );
    const workspaceSourceKey = stringValue(workspaceSource.rows[0]?.legacy_source_key);
    const legacyWorkspaceId = workspaceSourceKey.startsWith("legacy:workspace:")
      ? workspaceSourceKey.slice("legacy:workspace:".length)
      : state.workspaceId;
    const members = await database.query<SqlRow>(
      `SELECT rm.account_id::text, rm.role::text, a.username
       FROM room_members rm JOIN accounts a ON a.id = rm.account_id
       WHERE rm.document_id = $1 ORDER BY rm.created_at, rm.account_id`, [state.documentId],
    );
    // Historical authorship survives membership revocation, so the rollback
    // serializer needs names for every referenced account, not only members
    // who remain in the room after this command.
    const accounts = await database.query<SqlRow>("SELECT id::text, username FROM accounts ORDER BY id");
    const invitations = await database.query<SqlRow>(
      `SELECT id::text, invitee_username_normalized, intended_role::text, status::text, expires_at
       FROM room_invitations WHERE document_id = $1 ORDER BY created_at, id`, [state.documentId],
    );
    const mirroredInvitations = invitations.rows.map((invitation) => {
      const role = stringValue(invitation.intended_role);
      if (role !== "viewer" && role !== "commenter" && role !== "collaborator") {
        throw new PersistenceCutoverError("room invitation mirror contains an invalid role");
      }
      return {
        id: stringValue(invitation.id), normalizedUsername: stringValue(invitation.invitee_username_normalized), role: role as "viewer" | "commenter" | "collaborator",
        status: stringValue(invitation.status), expiresAt: asIso(invitation.expires_at),
      };
    });
    const usernames = new Map(accounts.rows.map((account) => [stringValue(account.id), stringValue(account.username)]));
    const projection = legacyMirrorProjection(
      state,
      usernames,
      members.rows.map((member) => ({ accountId: stringValue(member.account_id), role: member.role as RoomRole })),
      legacyId,
      mirroredInvitations,
    );
    // Existing legacy clients identify a workspace by its legacy source ID,
    // never the normalized UUID.  Newly-created workspaces have no legacy key
    // and deliberately retain their UUID in the rollback catalog.
    projection.document.workspaceId = legacyWorkspaceId;
    const catalogResult = await database.query<SqlRow>("SELECT value FROM collab_state WHERE key = 'documents' FOR UPDATE");
    const catalogValue = catalogResult.rows[0] ? asJson(catalogResult.rows[0].value) : [];
    if (!Array.isArray(catalogValue)) throw new PersistenceCutoverError("legacy documents catalog is malformed");
    let replaced = false;
    const nextCatalog = catalogValue.map((candidate) => {
      const existing = asJsonObject(candidate);
      if (existing.id !== legacyId) return candidate;
      replaced = true;
      return { ...existing, ...projection.document };
    });
    if (!replaced) nextCatalog.push(projection.document);
    const actualDocument = nextCatalog.find((candidate) => asJsonObject(candidate).id === legacyId);
    if (!actualDocument) throw new PersistenceCutoverError("could not build legacy document mirror");
    const checksum = legacyMirrorChecksum(actualDocument, projection.state);
    if (!source.rows[0]) {
      await database.query(
        `INSERT INTO migration_sources (source_key, source_checksum, document_id)
         VALUES ($1, $2, $3)`, [sourceKey, checksum, state.documentId],
      );
    }
    await database.query(
      `INSERT INTO collab_state (key, value) VALUES ('documents', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(nextCatalog)],
    );
    await database.query(
      `INSERT INTO collab_state (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [`doc_${legacyId}`, JSON.stringify(projection.state)],
    );
    await database.query(
      `INSERT INTO legacy_blob_mirror_receipts (document_id, source_key, document_revision, blob_checksum, mirrored_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (document_id) DO UPDATE SET source_key = EXCLUDED.source_key,
         document_revision = EXCLUDED.document_revision, blob_checksum = EXCLUDED.blob_checksum,
         mirrored_at = EXCLUDED.mirrored_at`,
      [state.documentId, sourceKey, state.revision, checksum],
    );
  }

  private async loadDocumentState(database: SqlQueryable, documentId: DocumentId, lock: boolean): Promise<DocumentStateV2 | null> {
    const document = await database.query<SqlRow>(
      `SELECT id::text, workspace_id::text, kind::text, revision, title, active_version_number
       FROM documents WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
      [documentId],
    );
    const row = document.rows[0];
    if (!row) return null;
    const versionsResult = await database.query<SqlRow>(`SELECT id::text AS database_id, COALESCE(legacy_version_id, id::text) AS id, version_number, source_html,
        CASE WHEN published_at IS NULL THEN 'Draft' ELSE 'Live' END AS status, created_at, created_by_account_id::text,
        published_at, published_by_account_id::text, source_locked_at, source_locked_by_account_id::text, derived_cache
        FROM document_versions WHERE document_id = $1 ORDER BY version_number`, [documentId]);
    const artifactsResult = await database.query<SqlRow>("SELECT artifact, artifact_fingerprint FROM semantic_artifacts WHERE document_id = $1", [documentId]);
    const plansResult = await database.query<SqlRow>("SELECT plan, artifact_fingerprint FROM visual_plans WHERE document_id = $1", [documentId]);
    const commentsResult = await database.query<SqlRow>(`SELECT c.id::text AS database_id, COALESCE(c.legacy_thread_id, c.id::text) AS id, c.version_id::text,
        c.author_account_id::text, c.target_payload, c.body, c.lifecycle::text, c.anchor_state::text, c.created_at,
        c.resolved_at, c.resolved_by_account_id::text AS resolved_by
        FROM comment_threads c WHERE c.document_id = $1 ORDER BY c.created_at, c.id`, [documentId]);
    const repliesResult = await database.query<SqlRow>(`SELECT r.thread_id::text, COALESCE(r.legacy_reply_id, r.id::text) AS id, r.author_account_id::text AS author, r.body, r.legacy_sequence, r.created_at
        FROM comment_replies r JOIN comment_threads c ON c.id = r.thread_id
        WHERE c.document_id = $1 ORDER BY r.legacy_sequence, r.id`, [documentId]);
    const historyResult = await database.query<SqlRow>(`SELECT h.thread_id::text, h.event_type, h.event_payload, h.legacy_sequence, h.created_at, h.actor_account_id::text AS actor
        FROM comment_history h JOIN comment_threads c ON c.id = h.thread_id
        WHERE c.document_id = $1 ORDER BY h.legacy_sequence, h.id`, [documentId]);
    const verdictsResult = await database.query<SqlRow>("SELECT account_id::text, verdict::text, updated_at FROM verdicts WHERE document_id = $1 ORDER BY account_id", [documentId]);
    const artifact = artifactsResult.rows[0] ? asJson(artifactsResult.rows[0].artifact) : undefined;
    let plan = plansResult.rows[0] ? asJson(plansResult.rows[0].plan) : undefined;
    if (artifact !== undefined) {
      const fingerprint = fingerprintSemanticArtifact(artifact as NonNullable<DocumentStateV2["semanticArtifact"]>);
      if (stringValue(artifactsResult.rows[0]?.artifact_fingerprint) !== fingerprint) {
        throw new PersistenceValidationError("semantic artifact fingerprint does not match canonical artifact");
      }
      plan = stringValue(plansResult.rows[0]?.artifact_fingerprint) === fingerprint
        ? currentVisualPlan(plan, artifact as NonNullable<DocumentStateV2["semanticArtifact"]>)
        : currentVisualPlan(undefined, artifact as NonNullable<DocumentStateV2["semanticArtifact"]>);
    }
    const versions = versionsResult.rows.map((version) => ({
      id: stringValue(version.id), versionNumber: Number(version.version_number), html: stringValue(version.source_html),
      status: version.status === "Live" ? "Live" : "Draft", createdAt: asIso(version.created_at),
      ...(version.created_by_account_id ? { createdByAccountId: stringValue(version.created_by_account_id) } : {}),
      ...(optionalIso(version.published_at) ? { publishedAt: optionalIso(version.published_at), publishedByAccountId: stringValue(version.published_by_account_id) } : {}),
      ...(optionalIso(version.source_locked_at) ? { lockedAt: optionalIso(version.source_locked_at), lockedByAccountId: stringValue(version.source_locked_by_account_id) } : {}),
      ...(version.derived_cache ? { derivedCache: asJson(version.derived_cache) } : {}),
    })) as DocumentVersionSnapshot[];
    const versionIds = new Map(versionsResult.rows.map((version) => [stringValue(version.database_id), stringValue(version.id)]));
    const replies = new Map<string, Array<Record<string, unknown>>>();
    for (const reply of repliesResult.rows) {
      const values = replies.get(stringValue(reply.thread_id)) ?? [];
      values.push({ id: stringValue(reply.id), author: stringValue(reply.author), body: stringValue(reply.body), mentions: [], ts: asMillis(reply.created_at) });
      replies.set(stringValue(reply.thread_id), values);
    }
    const histories = new Map<string, Array<Record<string, unknown>>>();
    for (const history of historyResult.rows) {
      const values = histories.get(stringValue(history.thread_id)) ?? [];
      const payload = asJsonObject(history.event_payload);
      values.push({ event: stringValue(history.event_type), who: stringValue(history.actor, stringValue(payload.who)), when: typeof payload.when === "number" ? payload.when : asMillis(history.created_at) });
      histories.set(stringValue(history.thread_id), values);
    }
    const comments = commentsResult.rows.map((comment) => {
      const payload = asJsonObject(comment.target_payload);
      const resolutionMetadata = payload.resolution && typeof payload.resolution === "object"
        ? payload.resolution as Record<string, unknown>
        : {};
      // Normalized FK columns are authoritative for security attribution;
      // legacy payload metadata may still contain the pre-migration username.
      const resolution = comment.lifecycle === "resolved"
        ? { ...resolutionMetadata, resolvedBy: stringValue(comment.resolved_by), resolvedAt: asMillis(comment.resolved_at) }
        : null;
      return {
        id: stringValue(comment.id), versionId: versionIds.get(stringValue(comment.version_id)) ?? stringValue(comment.version_id),
        author: stringValue(comment.author_account_id), body: stringValue(comment.body), createdAt: asMillis(comment.created_at),
        feedbackType: payload.feedbackType ?? null, lifecycle: comment.lifecycle === "resolved" ? "resolved" : "open",
        anchorStatus: comment.anchor_state === "stale" || comment.anchor_state === "orphaned" ? comment.anchor_state : "anchored",
        target: payload.target ?? {}, ...(typeof payload.posStart === "number" ? { posStart: payload.posStart } : {}),
        ...(typeof payload.posEnd === "number" ? { posEnd: payload.posEnd } : {}), lastKnownContext: stringValue(payload.lastKnownContext),
        resolution, replies: replies.get(stringValue(comment.database_id)) ?? [], mentions: Array.isArray(payload.mentions) ? payload.mentions : [],
        history: histories.get(stringValue(comment.database_id)) ?? [],
      };
    }) as unknown as CommentThreadSnapshot[];
    const state: DocumentStateV2 = {
      schemaVersion: 2, documentId: stringValue(row.id), workspaceId: stringValue(row.workspace_id), kind: row.kind as DocumentStateV2["kind"],
      revision: Number(row.revision), title: stringValue(row.title), activeVersionNumber: Number(row.active_version_number), versions, comments,
      verdicts: verdictsResult.rows.map((verdict) => ({ accountId: stringValue(verdict.account_id), verdict: verdict.verdict === "approve" ? "approve" : verdict.verdict === "request_changes" ? "changes" : verdict.verdict === "block" ? "block" : null, updatedAt: asIso(verdict.updated_at) })),
      ...(artifact !== undefined ? { semanticArtifact: artifact as NonNullable<DocumentStateV2["semanticArtifact"]> } : {}),
      ...(plan !== undefined ? { visualPlan: plan as NonNullable<DocumentStateV2["visualPlan"]> } : {}), capabilities: [],
    };
    const validation = validateDocumentStateV2(state);
    if (!validation.valid) throw new PersistenceValidationError(`normalized projection is invalid: ${validation.errors.join("; ")}`);
    return state;
  }

  private async accountIdForActor(database: SqlQueryable, actor: string): Promise<string> {
    if (isUuid(actor)) {
      const byId = await database.query<SqlRow>("SELECT id::text FROM accounts WHERE id = $1", [actor]);
      if (!byId.rows[0]?.id) throw new PersistenceValidationError("comment actor references an unknown immutable account");
      return stringValue(byId.rows[0].id);
    }
    const normalized = normalizeUsername(actor);
    if (!normalized) throw new PersistenceValidationError("comment actor username is invalid");
    const result = await database.query<SqlRow>("SELECT id::text FROM accounts WHERE username_normalized = $1", [normalized]);
    if (!result.rows[0]?.id) throw new PersistenceValidationError(`comment actor has no immutable account mapping: ${normalized}`);
    return stringValue(result.rows[0].id);
  }

  private async replaceProjection(database: TransactionClient, state: DocumentStateV2): Promise<void> {
    const validation = validateDocumentStateV2(state);
    if (!validation.valid) throw new PersistenceValidationError(`cannot persist invalid projection: ${validation.errors.join("; ")}`);
    // The projection is a command result, not a replaceable blob.  In
    // particular, versions, comments, replies, and history are durable audit
    // records: reusing their rows preserves foreign keys and immutable
    // author/creation metadata across every subsequent command.
    const versionIds = new Map<string, string>();
    for (const version of state.versions) {
      const createdBy = version.createdByAccountId ?? (await this.ownerForDocument(database, state.documentId));
      const publishedAt = version.publishedAt ?? (version.status === "Live" ? version.createdAt : null);
      const publishedBy = version.publishedByAccountId ?? (version.status === "Live" ? createdBy : null);
      const inserted = await database.query<SqlRow>(
        `INSERT INTO document_versions (document_id, legacy_version_id, version_number, source_html, created_by_account_id, created_at,
          published_at, published_by_account_id, source_locked_at, source_locked_by_account_id, derived_cache)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
         ON CONFLICT (document_id, version_number) DO UPDATE SET
           source_html = EXCLUDED.source_html,
           published_at = EXCLUDED.published_at,
           published_by_account_id = EXCLUDED.published_by_account_id,
           source_locked_at = EXCLUDED.source_locked_at,
           source_locked_by_account_id = EXCLUDED.source_locked_by_account_id,
           derived_cache = EXCLUDED.derived_cache
         RETURNING id::text`,
        [state.documentId, version.id, version.versionNumber, version.html, createdBy, version.createdAt, publishedAt,
          publishedBy, version.lockedAt ?? null, version.lockedByAccountId ?? null, nullableJson(version.derivedCache)],
      );
      versionIds.set(version.id, stringValue(inserted.rows[0]?.id));
    }
    if (state.kind === "decision_room" && state.semanticArtifact && state.visualPlan) {
      const fingerprint = fingerprintSemanticArtifact(state.semanticArtifact);
      await database.query(
        `INSERT INTO semantic_artifacts (document_id, artifact, artifact_fingerprint) VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (document_id) DO UPDATE SET artifact = EXCLUDED.artifact,
           artifact_fingerprint = EXCLUDED.artifact_fingerprint, updated_at = now()`,
        [state.documentId, JSON.stringify(state.semanticArtifact), fingerprint],
      );
      await database.query(
        `INSERT INTO visual_plans (document_id, plan, artifact_fingerprint) VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (document_id) DO UPDATE SET plan = EXCLUDED.plan,
           artifact_fingerprint = EXCLUDED.artifact_fingerprint, updated_at = now()`,
        [state.documentId, JSON.stringify(state.visualPlan), fingerprint],
      );
    }
    for (const comment of state.comments) {
      const versionId = versionIds.get(comment.versionId);
      if (!versionId) throw new PersistenceValidationError(`comment ${comment.id} references an unknown version`);
      const authorId = await this.accountIdForActor(database, comment.author);
      const resolverId = comment.lifecycle === "resolved" && comment.resolution ? await this.accountIdForActor(database, comment.resolution.resolvedBy) : null;
      const targetPayload = { target: comment.target, feedbackType: comment.feedbackType, posStart: comment.posStart, posEnd: comment.posEnd,
        lastKnownContext: comment.lastKnownContext, mentions: comment.mentions, resolution: comment.resolution };
      const inserted = await database.query<SqlRow>(
        `INSERT INTO comment_threads (legacy_thread_id, document_id, version_id, author_account_id, target_payload, body, lifecycle, anchor_state,
          resolved_at, resolved_by_account_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::comment_lifecycle, $8::anchor_status, $9, $10, $11, now())
         ON CONFLICT (document_id, legacy_thread_id) DO UPDATE SET
           lifecycle = EXCLUDED.lifecycle,
           anchor_state = EXCLUDED.anchor_state,
           target_payload = jsonb_set(
             jsonb_set(
               jsonb_set(
                 jsonb_set(comment_threads.target_payload, '{resolution}', COALESCE(EXCLUDED.target_payload -> 'resolution', 'null'::jsonb), true),
                 '{posStart}', COALESCE(EXCLUDED.target_payload -> 'posStart', 'null'::jsonb), true),
               '{posEnd}', COALESCE(EXCLUDED.target_payload -> 'posEnd', 'null'::jsonb), true),
             '{lastKnownContext}', COALESCE(EXCLUDED.target_payload -> 'lastKnownContext', 'null'::jsonb), true),
           resolved_at = EXCLUDED.resolved_at,
           resolved_by_account_id = EXCLUDED.resolved_by_account_id,
           updated_at = now()
         WHERE comment_threads.version_id = EXCLUDED.version_id
           AND comment_threads.author_account_id = EXCLUDED.author_account_id
           AND comment_threads.body = EXCLUDED.body
           AND comment_threads.created_at = EXCLUDED.created_at
           AND comment_threads.target_payload -> 'target' IS NOT DISTINCT FROM EXCLUDED.target_payload -> 'target'
           AND comment_threads.target_payload -> 'feedbackType' IS NOT DISTINCT FROM EXCLUDED.target_payload -> 'feedbackType'
           AND comment_threads.target_payload -> 'mentions' IS NOT DISTINCT FROM EXCLUDED.target_payload -> 'mentions'
         RETURNING id::text`,
        [comment.id, state.documentId, versionId, authorId, JSON.stringify(targetPayload), comment.body, comment.lifecycle, comment.anchorStatus,
          comment.lifecycle === "resolved" && comment.resolution ? new Date(comment.resolution.resolvedAt).toISOString() : null, resolverId, new Date(comment.createdAt).toISOString()],
      );
      const threadId = stringValue(inserted.rows[0]?.id);
      if (!threadId) throw new PersistenceInvariantError(`comment ${comment.id} conflicts with immutable persisted data`);
      for (const [legacySequence, reply] of comment.replies.entries()) {
        const replyAuthorId = await this.accountIdForActor(database, reply.author);
        const stored = await database.query<SqlRow>(
          `INSERT INTO comment_replies (legacy_reply_id, thread_id, author_account_id, body, legacy_sequence, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (thread_id, legacy_reply_id) DO UPDATE SET legacy_reply_id = comment_replies.legacy_reply_id
           WHERE comment_replies.author_account_id = EXCLUDED.author_account_id
             AND comment_replies.body = EXCLUDED.body
             AND comment_replies.legacy_sequence = EXCLUDED.legacy_sequence
             AND comment_replies.created_at = EXCLUDED.created_at
           RETURNING id::text`,
          [reply.id, threadId, replyAuthorId, reply.body, legacySequence, new Date(reply.ts).toISOString()],
        );
        if (!stored.rows[0]) throw new PersistenceInvariantError(`reply ${reply.id} conflicts with immutable persisted data`);
      }
      for (const [legacySequence, history] of comment.history.entries()) {
        const actorId = history.who ? await this.accountIdForActor(database, history.who) : null;
        const stored = await database.query<SqlRow>(
          `INSERT INTO comment_history (thread_id, actor_account_id, event_type, event_payload, legacy_sequence, created_at)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6)
           ON CONFLICT (thread_id, legacy_sequence) DO UPDATE SET legacy_sequence = comment_history.legacy_sequence
           WHERE comment_history.actor_account_id IS NOT DISTINCT FROM EXCLUDED.actor_account_id
             AND comment_history.event_type = EXCLUDED.event_type
             AND comment_history.created_at = EXCLUDED.created_at
           RETURNING id::text`,
          [threadId, actorId, history.event, JSON.stringify({ who: history.who, when: history.when }), legacySequence, new Date(history.when).toISOString()],
        );
        if (!stored.rows[0]) throw new PersistenceInvariantError(`history sequence ${legacySequence} conflicts with immutable persisted data`);
      }
    }
    for (const verdict of state.verdicts) {
      if (verdict.verdict === null) {
        await database.query("DELETE FROM verdicts WHERE document_id = $1 AND account_id = $2", [state.documentId, verdict.accountId]);
        continue;
      }
      const stored = verdict.verdict === "changes" ? "request_changes" : verdict.verdict;
      await database.query(
        `INSERT INTO verdicts (document_id, account_id, verdict, updated_at) VALUES ($1, $2, $3::verdict_value, $4)
         ON CONFLICT (document_id, account_id) DO UPDATE SET verdict = EXCLUDED.verdict, updated_at = EXCLUDED.updated_at`,
        [state.documentId, verdict.accountId, stored, verdict.updatedAt],
      );
    }
  }

  private async ownerForDocument(database: SqlQueryable, documentId: string): Promise<string> {
    const result = await database.query<SqlRow>("SELECT account_id::text FROM room_members WHERE document_id = $1 AND role = 'owner' ORDER BY account_id LIMIT 1", [documentId]);
    if (!result.rows[0]?.account_id) throw new PersistenceInvariantError("document has no room owner");
    return stringValue(result.rows[0].account_id);
  }
}
