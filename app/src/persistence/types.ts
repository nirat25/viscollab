/**
 * Phase-9 persistence contracts.  These are framework-free projections and
 * command guards; storage adapters live in web and must not make these types
 * less strict by accepting an unvalidated blob.
 */

import type { AgentBrief } from "../agent/types.js";
import type { Comment, Verdict } from "../collab/comments.js";
import type { SemanticArtifact } from "../semantic/types.js";
import type { TipTapVisualDoc } from "../visual/project.js";
import type { VisualPlan } from "../visual/types.js";

export type AccountId = string;
export type WorkspaceId = string;
export type DocumentId = string;

/** A username is mutable display/login data. It is never an authorization key. */
export interface Account {
  id: AccountId;
  username: string;
  normalizedUsername: string;
  /** Intentionally server-only; never include this field in a session. */
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionIdentity {
  accountId: AccountId;
  username: string;
}

export type RoomRole = "viewer" | "commenter" | "collaborator" | "owner";
export type WorkspaceRole = "member" | "owner";

export interface RoomMembership {
  documentId: DocumentId;
  accountId: AccountId;
  role: RoomRole;
  createdAt: string;
}

export interface WorkspaceMembership {
  workspaceId: WorkspaceId;
  accountId: AccountId;
  role: WorkspaceRole;
  createdAt: string;
}

export type Capability =
  | "room.read"
  | "agent.ask"
  | "comment.create"
  | "comment.reply"
  | "verdict.set_self"
  | "comment.resolve"
  | "comment.reopen"
  | "room.edit"
  | "version.create"
  | "version.regenerate"
  | "source.lock"
  | "agent.export"
  | "version.publish"
  | "member.manage"
  | "room.archive"
  | "ownership.transfer"
  | "workspace.create_document"
  | "workspace.member_manage";

/** Extra server-derived facts needed for ownership-sensitive commands. */
export interface AuthorizationContext {
  /** Required only for comment resolve/reopen. Never accepted from the client. */
  threadAuthorAccountId?: AccountId;
  /** Required for workspace operations; room roles never grant them. */
  workspaceOwnerAccountId?: AccountId;
}

export interface AuthorizationSubject {
  accountId: AccountId;
}

export interface AuthorizationResource {
  documentId?: DocumentId;
  workspaceId?: WorkspaceId;
  roomRole?: unknown;
  workspaceRole?: unknown;
}

export type DocumentKind = "legacy" | "decision_room";
export type VersionStatus = "Draft" | "Live";

export interface DerivedCacheSnapshot {
  semanticArtifactFingerprint: string;
  semanticSchemaVersion: 1;
  projectionSchemaVersion: 1;
  tipTapDoc?: TipTapVisualDoc;
  agentBrief?: AgentBrief;
}

export interface DocumentVersionSnapshot {
  id: string;
  versionNumber: number;
  html: string;
  status: VersionStatus;
  createdAt: string;
  createdByAccountId?: AccountId;
  publishedAt?: string;
  publishedByAccountId?: AccountId;
  lockedAt?: string;
  lockedByAccountId?: AccountId;
  derivedCache?: DerivedCacheSnapshot;
}

/** The legacy comment data remains intact while Phase 9 normalizes its rows. */
export type CommentThreadSnapshot = Comment;

export interface OwnableVerdictSnapshot {
  accountId: AccountId;
  verdict: Verdict;
  updatedAt: string;
}

export interface DocumentStateV2 {
  schemaVersion: 2;
  documentId: DocumentId;
  workspaceId: WorkspaceId;
  kind: DocumentKind;
  /** Monotonic, incremented exactly once per successful command mutation. */
  revision: number;
  title: string;
  activeVersionNumber: number;
  versions: readonly DocumentVersionSnapshot[];
  comments: readonly CommentThreadSnapshot[];
  verdicts: readonly OwnableVerdictSnapshot[];
  semanticArtifact?: SemanticArtifact;
  visualPlan?: VisualPlan;
  /** Server-derived affordances only; they are not authorization proof. */
  capabilities: readonly Capability[];
}

export interface RevisionConflict {
  status: 409;
  code: "revision_conflict";
  currentRevision: number;
}

export type RevisionCheck = { ok: true } | { ok: false; conflict: RevisionConflict };

/** A narrow-command base. Actor, timestamp and all state collections are server-derived. */
export interface CommandInput {
  expectedRevision: number;
}

export interface CreateCommentInput extends CommandInput {
  body: string;
  target: Comment["target"];
  feedbackType?: Comment["feedbackType"];
}

export interface ReplyToCommentInput extends CommandInput { threadId: string; body: string; }
export interface ResolveCommentInput extends CommandInput { threadId: string; }
export interface ReopenCommentInput extends CommandInput { threadId: string; }
export interface SetOwnVerdictInput extends CommandInput { verdict: Verdict; }
export interface CreateVersionInput extends CommandInput { html: string; }
export interface EditVersionInput extends CommandInput { html: string; }
export interface RegenerateVersionInput extends CommandInput { instruction: string; }
export interface PublishVersionInput extends CommandInput { versionNumber: number; }
export interface LockSourceInput extends CommandInput { locked: boolean; }

export type AnyNarrowCommandInput =
  | CreateCommentInput | ReplyToCommentInput | ResolveCommentInput | ReopenCommentInput
  | SetOwnVerdictInput | CreateVersionInput | EditVersionInput | RegenerateVersionInput
  | PublishVersionInput | LockSourceInput;

export interface LegacyDocumentRecord {
  documentId: string;
  workspaceId: string;
  title?: string;
  /** The old per-document collab_state JSON value. */
  state: unknown;
}

export interface LegacyMigrationResult {
  state: DocumentStateV2;
  /** Safe defaults/shape repairs; identity errors belong in the web issue ledger. */
  warnings: readonly string[];
}
