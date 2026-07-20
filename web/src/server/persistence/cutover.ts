import { createHash } from "node:crypto";
import { isUuid, normalizeUsername } from "htmlcollab-app/persistence";
import type { DocumentStateV2, RoomRole } from "htmlcollab-app/persistence";

/**
 * The operational flag is intentionally small and conservative.  It is read
 * from the singleton row, never from a request body or client configuration.
 */
export interface PersistenceCutoverState {
  readMode: "blob" | "table";
  dualWriteEnabled: boolean;
  lastParityVerifiedAt?: string;
  /** Computed by the repository from unresolved migration issues. */
  parityIsClean: boolean;
}

export class PersistenceCutoverError extends Error {
  override name = "PersistenceCutoverError";
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Same sorted-key representation used by backfill/parity tooling. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!record(value)) throw new PersistenceCutoverError("cannot checksum a non-JSON value");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

/** Receipt checksum covers both legacy catalog metadata and per-room state. */
export function legacyMirrorChecksum(document: unknown, state: unknown): string {
  return sha256Json({ document, state });
}

export function cutoverStateFromRow(row: unknown): PersistenceCutoverState {
  if (!record(row)) throw new PersistenceCutoverError("persistence_cutover_state singleton is missing");
  const readMode = row.read_mode;
  if (readMode !== "blob" && readMode !== "table") {
    throw new PersistenceCutoverError("persistence_cutover_state has an invalid read mode");
  }
  if (typeof row.dual_write_enabled !== "boolean") {
    throw new PersistenceCutoverError("persistence_cutover_state has an invalid dual-write flag");
  }
  const parity = row.last_parity_verified_at;
  const clean = row.parity_is_clean;
  return {
    readMode,
    dualWriteEnabled: row.dual_write_enabled,
    ...(parity === null || parity === undefined ? {} : { lastParityVerifiedAt: new Date(String(parity)).toISOString() }),
    parityIsClean: clean === true || clean === "true" || clean === 1 || clean === "1",
  };
}

/** Table reads must never begin before parity evidence and dual write exist. */
export function assertCutoverReadSafety(state: PersistenceCutoverState): void {
  if (state.readMode !== "table") return;
  if (!state.dualWriteEnabled) throw new PersistenceCutoverError("table reads require dual_write_enabled=true");
  if (!state.lastParityVerifiedAt || !state.parityIsClean) {
    throw new PersistenceCutoverError("table reads require a clean parity marker");
  }
}

/** A normalized command must never get ahead of the blob rollback mirror. */
export function assertMutationMirrorSafety(state: PersistenceCutoverState): void {
  if (!state.dualWriteEnabled) {
    throw new PersistenceCutoverError("normalized mutations require dual_write_enabled=true during the rollback window");
  }
}

export interface LegacyAccountMirrorInput {
  username: string;
  passwordHash: string;
  passwordSalt: string;
}

export interface LegacyWorkspaceMirrorInput {
  id: string;
  legacySourceKey?: string;
  name: string;
  ownerUsername: string;
  members: readonly { username: string; role: "member" | "owner" }[];
  invitations: readonly {
    id: string;
    normalizedUsername: string;
    status: "pending" | "accepted" | "revoked" | "expired";
    expiresAt: string;
  }[];
}

/** Legacy identity mirrors contain credentials only—never roles or bearer tokens. */
export function legacyUsersProjection(accounts: readonly LegacyAccountMirrorInput[]): JsonRecord[] {
  return [...accounts]
    .sort((a, b) => (normalizeUsername(a.username) ?? a.username).localeCompare(normalizeUsername(b.username) ?? b.username))
    .map((account) => {
      const selfContained = /^scrypt-v1\$([0-9a-f]+)\$([0-9a-f]+)$/i.exec(account.passwordHash);
      return {
        username: account.username,
        passwordSalt: selfContained?.[1] ?? account.passwordSalt,
        passwordHash: selfContained?.[2] ?? account.passwordHash,
      };
    });
}

function legacyWorkspaceId(workspace: LegacyWorkspaceMirrorInput): string {
  const prefix = "legacy:workspace:";
  return workspace.legacySourceKey?.startsWith(prefix) && workspace.legacySourceKey.slice(prefix.length)
    ? workspace.legacySourceKey.slice(prefix.length)
    : workspace.id;
}

/** Pending invite metadata is mirrored, but no invite/share token is created. */
export function legacyWorkspacesProjection(workspaces: readonly LegacyWorkspaceMirrorInput[]): JsonRecord[] {
  return [...workspaces]
    .sort((a, b) => legacyWorkspaceId(a).localeCompare(legacyWorkspaceId(b)))
    .map((workspace) => ({
      id: legacyWorkspaceId(workspace),
      normalizedId: workspace.id,
      name: workspace.name,
      createdBy: workspace.ownerUsername,
      members: workspace.members.map((member) => ({ username: member.username, role: member.role })),
      invitations: workspace.invitations.map((invitation) => ({
        id: invitation.id,
        username: invitation.normalizedUsername,
        role: "member",
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      })),
    }));
}

/**
 * Legacy blobs attribute review data by username.  Convert those values back
 * to immutable account IDs before command authorization/ownership checks.
 */
export function remapLegacyReviewIdentities(
  state: DocumentStateV2,
  accountIdsByNormalizedUsername: ReadonlyMap<string, string>,
  verifiedLegacyState?: unknown,
  fallbackOwnerAccountId?: string,
): DocumentStateV2 {
  const knownIds = new Set(accountIdsByNormalizedUsername.values());
  const accountIdFor = (identity: string): string => {
    if (isUuid(identity) && knownIds.has(identity)) return identity;
    const normalized = normalizeUsername(identity);
    const accountId = normalized ? accountIdsByNormalizedUsername.get(normalized) : undefined;
    if (!accountId) throw new PersistenceCutoverError(`legacy review identity has no immutable account mapping: ${identity}`);
    return accountId;
  };
  const old = record(verifiedLegacyState) ? verifiedLegacyState : {};
  const legacyVersions = Array.isArray(old.versions) ? old.versions : [];
  const legacyComments = Array.isArray(old.comments) ? old.comments : [];
  const legacyVerdictMetadata = record(old.verdictMetadata) ? old.verdictMetadata : {};
  const iso = (value: unknown): string | undefined => {
    const date = typeof value === "string" || typeof value === "number" ? new Date(value) : undefined;
    return date && !Number.isNaN(date.valueOf()) ? date.toISOString() : undefined;
  };
  return {
    ...state,
    versions: state.versions.map((version, index) => {
      const legacy = legacyVersions.find((candidate) => record(candidate) && candidate.id === version.id);
      const source = record(legacy) ? legacy : record(legacyVersions[index]) ? legacyVersions[index] as JsonRecord : {};
      const createdBy = typeof source.createdBy === "string" ? accountIdFor(source.createdBy) : fallbackOwnerAccountId;
      const live = version.status === "Live" || (typeof source.status === "string" && ["live", "published"].includes(source.status.toLowerCase()));
      const publishedAt = live ? iso(source.publishedAt) ?? iso(source.timestamp ?? source.createdAt) ?? version.createdAt : undefined;
      const publishedBy = live
        ? typeof source.publishedBy === "string" ? accountIdFor(source.publishedBy) : createdBy
        : undefined;
      const lockedAt = iso(source.sourceLockedAt ?? source.lockedAt);
      const lockedBy = lockedAt
        ? typeof (source.sourceLockedBy ?? source.lockedBy) === "string"
          ? accountIdFor(String(source.sourceLockedBy ?? source.lockedBy))
          : createdBy
        : undefined;
      return {
        ...version,
        status: live ? "Live" as const : "Draft" as const,
        ...(createdBy ? { createdByAccountId: createdBy } : {}),
        ...(publishedAt && publishedBy ? { publishedAt, publishedByAccountId: publishedBy } : {}),
        ...(lockedAt && lockedBy ? { lockedAt, lockedByAccountId: lockedBy } : {}),
      };
    }),
    comments: state.comments.map((comment, index) => {
      const legacy = legacyComments.find((candidate) => record(candidate) && candidate.id === comment.id);
      const source = record(legacy) ? legacy : record(legacyComments[index]) ? legacyComments[index] as JsonRecord : {};
      return {
        ...comment,
        author: accountIdFor(comment.author),
        ...(typeof source.posStart === "number" ? { posStart: source.posStart } : {}),
        ...(typeof source.posEnd === "number" ? { posEnd: source.posEnd } : {}),
        resolution: comment.resolution ? { ...comment.resolution, resolvedBy: accountIdFor(comment.resolution.resolvedBy) } : null,
        replies: comment.replies.map((reply) => ({ ...reply, author: accountIdFor(reply.author) })),
        history: comment.history.map((event) => ({ ...event, who: accountIdFor(event.who) })),
      };
    }),
    verdicts: state.verdicts.map((verdict) => {
      const metadata = record(legacyVerdictMetadata[verdict.accountId]) ? legacyVerdictMetadata[verdict.accountId] as JsonRecord : {};
      return { ...verdict, accountId: accountIdFor(verdict.accountId), updatedAt: iso(metadata.updatedAt) ?? verdict.updatedAt };
    }),
  };
}

/**
 * The old consumer expects username-attributed records and a document catalog.
 * This is a projection only: normalized rows remain authoritative and no
 * authorization data is ever read from this object.
 */
export function legacyMirrorProjection(
  state: DocumentStateV2,
  usernamesByAccountId: ReadonlyMap<string, string>,
  roomMembers: readonly { accountId: string; role: RoomRole }[],
  legacyDocumentId = state.documentId,
  roomInvitations: readonly { id: string; normalizedUsername: string; role: Exclude<RoomRole, "owner">; status: string; expiresAt: string }[] = [],
): { document: JsonRecord; state: JsonRecord } {
  const usernameFor = (accountId: string | undefined): string | undefined => {
    if (!accountId) return undefined;
    const username = usernamesByAccountId.get(accountId);
    if (!username) throw new PersistenceCutoverError(`cannot mirror unknown account ${accountId}`);
    return username;
  };
  const stateProjection: JsonRecord = {
    // Extra fields are ignored by the legacy UI but make a blob rollback
    // auditable and make the current revision observable.
    schemaVersion: 2,
    documentId: legacyDocumentId,
    revision: state.revision,
    title: state.title,
    activeVersionNum: state.activeVersionNumber,
    versions: state.versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      html: version.html,
      status: version.status,
      timestamp: version.createdAt,
      ...(usernameFor(version.createdByAccountId) ? { createdBy: usernameFor(version.createdByAccountId) } : {}),
      ...(version.publishedAt ? { publishedAt: version.publishedAt } : {}),
      ...(usernameFor(version.publishedByAccountId) ? { publishedBy: usernameFor(version.publishedByAccountId) } : {}),
      ...(version.lockedAt ? { sourceLockedAt: version.lockedAt } : {}),
      ...(usernameFor(version.lockedByAccountId) ? { sourceLockedBy: usernameFor(version.lockedByAccountId) } : {}),
    })),
    comments: state.comments.map((comment) => ({
      id: comment.id,
      versionId: comment.versionId,
      author: usernameFor(comment.author) ?? comment.author,
      body: comment.body,
      createdAt: comment.createdAt,
      feedbackType: comment.feedbackType,
      lifecycle: comment.lifecycle,
      anchorStatus: comment.anchorStatus,
      target: comment.target,
      ...(comment.posStart === undefined ? {} : { posStart: comment.posStart }),
      ...(comment.posEnd === undefined ? {} : { posEnd: comment.posEnd }),
      lastKnownContext: comment.lastKnownContext,
      resolution: comment.resolution
        ? { ...comment.resolution, resolvedBy: usernameFor(comment.resolution.resolvedBy) ?? comment.resolution.resolvedBy }
        : null,
      replies: comment.replies.map((reply) => ({ ...reply, author: usernameFor(reply.author) ?? reply.author })),
      mentions: comment.mentions,
      history: comment.history.map((event) => ({ ...event, who: usernameFor(event.who) ?? event.who })),
    })),
    verdicts: Object.fromEntries(
      [...state.verdicts]
        .filter((item) => item.verdict !== null)
        .map((item) => [usernameFor(item.accountId) ?? item.accountId, item.verdict]),
    ),
    verdictMetadata: Object.fromEntries(
      [...state.verdicts].map((item) => [usernameFor(item.accountId) ?? item.accountId, { updatedAt: item.updatedAt }]),
    ),
    ...(state.semanticArtifact ? { semanticArtifact: state.semanticArtifact } : {}),
    ...(state.visualPlan ? { visualPlan: state.visualPlan } : {}),
  };
  const document: JsonRecord = {
    id: legacyDocumentId,
    normalizedId: state.documentId,
    workspaceId: state.workspaceId,
    title: state.title,
    name: state.title,
    members: roomMembers.map((member) => ({
      username: usernameFor(member.accountId) ?? member.accountId,
      role: member.role,
    })),
    invitations: roomInvitations.map((invitation) => ({
      id: invitation.id,
      username: invitation.normalizedUsername,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    })),
  };
  return { document, state: stateProjection };
}
