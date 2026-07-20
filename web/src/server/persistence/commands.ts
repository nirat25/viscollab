import { randomUUID } from "node:crypto";
import { authorize, normalizeUsername } from "htmlcollab-app/persistence";
import type {
  AccountId, Capability, CreateCommentInput, DocumentId, DocumentStateV2, DocumentVersionSnapshot,
  LockSourceInput, PublishVersionInput, ReopenCommentInput, ReplyToCommentInput, ResolveCommentInput,
  RoomRole, SetOwnVerdictInput, WorkspaceId,
} from "htmlcollab-app/persistence";
import type { AnchorTarget, Comment, Verdict } from "htmlcollab-app/collab";
import type { SemanticArtifact } from "htmlcollab-app/semantic";
import type { VisualPlan } from "htmlcollab-app/visual";
import {
  type AgentRunRecord, type CommandResult,
  type DocumentCommandContext, type DocumentDomainEnvironment, type DocumentDomainMutation,
  type PersistenceRepository, type RoomInvitationRecord,
} from "./repository";

const MAX_BODY_LENGTH = 20_000;
const MAX_TITLE_LENGTH = 300;
const MAX_SAFE_METADATA_LENGTH = 200;
const SEMANTIC_NODE_KINDS = new Set(["decision", "claim", "evidence", "assumption", "risk", "option", "tradeoff", "action", "question", "stakeholder"]);

export class CommandAuthorizationError extends Error {
  readonly status = 403;
  readonly code = "forbidden" as const;
  override name = "CommandAuthorizationError";
  constructor() { super("forbidden"); }
}

export class CommandValidationError extends Error {
  readonly status = 400;
  readonly code = "invalid_command" as const;
  override name = "CommandValidationError";
}

export class CommandResourceNotFoundError extends Error {
  readonly status = 404;
  readonly code = "command_resource_not_found" as const;
  override name = "CommandResourceNotFoundError";
}

export class CommandStateError extends Error {
  readonly status = 409;
  readonly code = "invalid_state_transition" as const;
  override name = "CommandStateError";
}

export interface CommandServiceOptions {
  now?: () => Date;
  id?: () => string;
}

interface BaseDocumentInput { accountId: AccountId; documentId: DocumentId; expectedRevision: number; }
interface CreateVersionCommand extends BaseDocumentInput { html: string; }
interface EditVersionCommand extends BaseDocumentInput { html: string; }
interface RegenerateVersionCommand extends BaseDocumentInput { generatedHtml: string; }
interface InviteRoomMemberCommand extends BaseDocumentInput {
  normalizedUsername: string;
  role: Exclude<RoomRole, "owner">;
  expiresAt: string;
}
interface ChangeRoomRoleCommand extends BaseDocumentInput { targetAccountId: AccountId; role: Exclude<RoomRole, "owner">; }
interface TargetMemberCommand extends BaseDocumentInput { targetAccountId: AccountId; }
interface AskMetadataCommand extends BaseDocumentInput {
  model?: string;
  preset?: string;
  semanticArtifactFingerprint?: string;
}
interface CreateDocumentCommand {
  accountId: AccountId;
  workspaceId: WorkspaceId;
  title: string;
  html: string;
  semanticArtifact?: SemanticArtifact;
  visualPlan?: VisualPlan;
}

function requiredText(value: unknown, field: string, maximum = MAX_BODY_LENGTH): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > maximum) {
    throw new CommandValidationError(`${field} must be a non-empty string of at most ${maximum} characters`);
  }
  return value;
}

function safeOptional(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredText(value, field, MAX_SAFE_METADATA_LENGTH);
}

function allowlistedTarget(value: unknown): AnchorTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CommandValidationError("invalid comment target");
  const target = value as Record<string, unknown>;
  if (target.type === "text" && ["quote", "prefix", "suffix"].every((key) => typeof target[key] === "string") && (target.quote as string).length > 0) {
    return { type: "text", quote: target.quote as string, prefix: target.prefix as string, suffix: target.suffix as string };
  }
  if (target.type === "element" && typeof target.id === "string" && typeof target.path === "string"
    && typeof target.hash === "number" && Number.isInteger(target.hash) && typeof target.tag === "string" && typeof target.snippet === "string") {
    return { type: "element", id: target.id, path: target.path, hash: target.hash, tag: target.tag, snippet: target.snippet };
  }
  if (target.type === "semantic" && typeof target.artifactId === "string" && typeof target.semanticNodeId === "string") {
    if (target.nodeKind !== undefined && (typeof target.nodeKind !== "string" || !SEMANTIC_NODE_KINDS.has(target.nodeKind))) {
      throw new CommandValidationError("invalid semantic node kind");
    }
    return { type: "semantic", artifactId: target.artifactId, semanticNodeId: target.semanticNodeId,
      ...(typeof target.visualBlockId === "string" ? { visualBlockId: target.visualBlockId } : {}),
      ...(typeof target.nodeKind === "string" ? { nodeKind: target.nodeKind as Extract<AnchorTarget, { type: "semantic" }>["nodeKind"] } : {}),
      ...(typeof target.nodeLabel === "string" ? { nodeLabel: target.nodeLabel } : {}) };
  }
  throw new CommandValidationError("invalid comment target");
}

function assertRole(role: unknown): asserts role is Exclude<RoomRole, "owner"> {
  if (role !== "viewer" && role !== "commenter" && role !== "collaborator") throw new CommandValidationError("invalid room role");
}

function activeVersion(state: Readonly<DocumentStateV2>): DocumentVersionSnapshot {
  const version = state.versions.find((item) => item.versionNumber === state.activeVersionNumber);
  if (!version) throw new CommandStateError("active version is missing");
  return version;
}

function assertMutableRoom(environment: Readonly<DocumentDomainEnvironment>): void {
  if (environment.metadata.archivedAt) throw new CommandStateError("archived rooms cannot be mutated");
}

function assertCapability(
  accountId: AccountId,
  environment: Readonly<DocumentDomainEnvironment>,
  capability: Capability,
  threadAuthorAccountId?: AccountId,
): void {
  const allowed = authorize(
    { accountId },
    { documentId: environment.state.documentId, roomRole: environment.actorRole },
    capability,
    threadAuthorAccountId ? { threadAuthorAccountId } : {},
  );
  if (!allowed) throw new CommandAuthorizationError();
}

/**
 * Named server command layer. Routes may call these methods, but never the
 * repository transaction callbacks directly. Actor, IDs and timestamps are
 * injected here and audit metadata is allowlisted command-by-command.
 */
export class PersistenceCommandService {
  private readonly now: () => Date;
  private readonly id: () => string;

  constructor(private readonly repository: PersistenceRepository, options: CommandServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? randomUUID;
  }

  private timestamp(): { iso: string; ms: number } {
    const date = this.now();
    return { iso: date.toISOString(), ms: date.getTime() };
  }

  private execute<T>(
    input: BaseDocumentInput,
    capability: Capability,
    mutation: (environment: Readonly<DocumentDomainEnvironment>) => DocumentDomainMutation<T>,
    threadAuthor?: (environment: Readonly<DocumentDomainEnvironment>) => AccountId | undefined,
  ): Promise<CommandResult<T>> {
    const context: DocumentCommandContext = input;
    return this.repository.runDocumentDomainCommand(context, (environment) => {
      assertMutableRoom(environment);
      assertCapability(input.accountId, environment, capability, threadAuthor?.(environment));
      return mutation(environment);
    });
  }

  createComment(input: BaseDocumentInput & Omit<CreateCommentInput, "expectedRevision">): Promise<CommandResult<Comment>> {
    requiredText(input.body, "body");
    const allowlistedCommentTarget = allowlistedTarget(input.target);
    if (input.feedbackType !== undefined && input.feedbackType !== null && !["approve", "flag", "needs", "question"].includes(input.feedbackType)) {
      throw new CommandValidationError("invalid feedback type");
    }
    return this.execute(input, "comment.create", (environment) => {
      const { iso, ms } = this.timestamp();
      const version = activeVersion(environment.state);
      const target = allowlistedCommentTarget;
      if (target.type === "semantic") {
        const artifact = environment.state.semanticArtifact;
        if (!artifact || artifact.id !== target.artifactId || !artifact.nodes.some((node) => node.id === target.semanticNodeId)) {
          throw new CommandValidationError("semantic target does not belong to this room artifact");
        }
      }
      // Comment remains a legacy-shaped transport type, but every attribution
      // field stores the immutable account UUID. Read projections may hydrate
      // display names separately; authorization must never use those names.
      const comment: Comment = {
        id: this.id(), versionId: version.id, author: input.accountId, body: input.body,
        createdAt: ms, feedbackType: input.feedbackType ?? null, lifecycle: "open", anchorStatus: "anchored",
        target, lastKnownContext: target.type === "text" ? target.quote : target.type === "element" ? target.snippet : (target.nodeLabel ?? target.semanticNodeId),
        resolution: null, replies: [], mentions: [], history: [{ event: "created", who: input.accountId, when: ms }],
      };
      return {
        state: { ...environment.state, comments: [...environment.state.comments, comment] }, value: comment,
        auditEvents: [{ id: this.id(), type: "comment.created", actorAccountId: input.accountId, documentId: input.documentId,
          workspaceId: environment.state.workspaceId, occurredAt: iso, metadata: { commentId: comment.id } }],
      };
    });
  }

  replyToComment(input: BaseDocumentInput & Omit<ReplyToCommentInput, "expectedRevision">): Promise<CommandResult<Comment["replies"][number]>> {
    requiredText(input.body, "body");
    return this.execute(input, "comment.reply", (environment) => {
      const index = environment.state.comments.findIndex((comment) => comment.id === input.threadId);
      if (index < 0) throw new CommandResourceNotFoundError("comment thread not found");
      const { iso, ms } = this.timestamp();
      const reply = { id: this.id(), author: input.accountId, body: input.body, mentions: [], ts: ms };
      const comments = [...environment.state.comments];
      const current = comments[index]!;
      comments[index] = { ...current, replies: [...current.replies, reply], history: [...current.history, { event: "reply added", who: input.accountId, when: ms }] };
      return { state: { ...environment.state, comments }, value: reply,
        auditEvents: [{ id: this.id(), type: "comment.replied", actorAccountId: input.accountId, documentId: input.documentId,
          workspaceId: environment.state.workspaceId, occurredAt: iso, metadata: { commentId: input.threadId, replyId: reply.id } }] };
    });
  }

  resolveComment(input: BaseDocumentInput & Omit<ResolveCommentInput, "expectedRevision">): Promise<CommandResult<Comment>> {
    return this.changeCommentLifecycle(input, "resolved");
  }

  reopenComment(input: BaseDocumentInput & Omit<ReopenCommentInput, "expectedRevision">): Promise<CommandResult<Comment>> {
    return this.changeCommentLifecycle(input, "open");
  }

  private changeCommentLifecycle(input: BaseDocumentInput & { threadId: string }, lifecycle: "open" | "resolved"): Promise<CommandResult<Comment>> {
    requiredText(input.threadId, "threadId", 200);
    const capability = lifecycle === "resolved" ? "comment.resolve" : "comment.reopen";
    return this.execute(input, capability, (environment) => {
      const index = environment.state.comments.findIndex((comment) => comment.id === input.threadId);
      if (index < 0) throw new CommandResourceNotFoundError("comment thread not found");
      const current = environment.state.comments[index]!;
      if ((lifecycle === "resolved" && current.lifecycle === "resolved") || (lifecycle === "open" && current.lifecycle === "open")) {
        throw new CommandStateError(`comment is already ${lifecycle}`);
      }
      const { iso, ms } = this.timestamp();
      const next: Comment = lifecycle === "resolved"
        ? { ...current, lifecycle, resolution: { resolvedBy: input.accountId, resolvedAt: ms, changeLink: null,
          resolvedInVersion: environment.state.activeVersionNumber,
          ...(current.target.type === "semantic" ? { semanticNodeId: current.target.semanticNodeId } : {}) },
          history: [...current.history, { event: `resolved (no change) in v${environment.state.activeVersionNumber}`, who: input.accountId, when: ms }] }
        : { ...current, lifecycle, resolution: null, history: [...current.history, { event: "reopened", who: input.accountId, when: ms }] };
      const comments = [...environment.state.comments];
      comments[index] = next;
      return { state: { ...environment.state, comments }, value: next,
        auditEvents: [{ id: this.id(), type: lifecycle === "resolved" ? "comment.resolved" : "comment.reopened",
          actorAccountId: input.accountId, documentId: input.documentId, workspaceId: environment.state.workspaceId,
          occurredAt: iso, metadata: { commentId: input.threadId } }] };
    }, (environment) => environment.state.comments.find((comment) => comment.id === input.threadId)?.author);
  }

  setOwnVerdict(input: BaseDocumentInput & Omit<SetOwnVerdictInput, "expectedRevision">): Promise<CommandResult<Verdict>> {
    if (!["approve", "changes", "block", null].includes(input.verdict)) throw new CommandValidationError("invalid verdict");
    return this.execute(input, "verdict.set_self", (environment) => {
      const { iso } = this.timestamp();
      const verdicts = environment.state.verdicts.filter((item) => item.accountId !== input.accountId);
      verdicts.push({ accountId: input.accountId, verdict: input.verdict, updatedAt: iso });
      return { state: { ...environment.state, verdicts }, value: input.verdict,
        auditEvents: [{ id: this.id(), type: "verdict.set_self", actorAccountId: input.accountId, documentId: input.documentId,
          workspaceId: environment.state.workspaceId, occurredAt: iso, metadata: { verdict: input.verdict } }] };
    });
  }

  createVersion(input: CreateVersionCommand): Promise<CommandResult<DocumentVersionSnapshot>> {
    requiredText(input.html, "html", 5_000_000);
    return this.execute(input, "version.create", (environment) => this.addVersion(environment, input, input.html, "version.created"));
  }

  editVersion(input: EditVersionCommand): Promise<CommandResult<DocumentVersionSnapshot>> {
    requiredText(input.html, "html", 5_000_000);
    return this.execute(input, "room.edit", (environment) => {
      const current = activeVersion(environment.state);
      if (current.status !== "Draft" || current.lockedAt) throw new CommandStateError("only an unlocked draft can be edited");
      const { iso } = this.timestamp();
      const updated = { ...current, html: input.html, derivedCache: undefined };
      const versions = environment.state.versions.map((version) => version.id === current.id ? updated : version);
      return { state: { ...environment.state, versions }, value: updated,
        auditEvents: [{ id: this.id(), type: "version.edited", actorAccountId: input.accountId, documentId: input.documentId,
          workspaceId: environment.state.workspaceId, occurredAt: iso, metadata: { versionNumber: current.versionNumber } }] };
    });
  }

  regenerateVersion(input: RegenerateVersionCommand): Promise<CommandResult<DocumentVersionSnapshot>> {
    requiredText(input.generatedHtml, "generatedHtml", 5_000_000);
    return this.execute(input, "version.regenerate", (environment) => this.addVersion(environment, input, input.generatedHtml, "version.regenerated"));
  }

  private addVersion(environment: Readonly<DocumentDomainEnvironment>, input: BaseDocumentInput, html: string, type: "version.created" | "version.regenerated"): DocumentDomainMutation<DocumentVersionSnapshot> {
    const { iso } = this.timestamp();
    const versionNumber = Math.max(...environment.state.versions.map((version) => version.versionNumber)) + 1;
    const version: DocumentVersionSnapshot = { id: this.id(), versionNumber, html, status: "Draft", createdAt: iso, createdByAccountId: input.accountId };
    return { state: { ...environment.state, versions: [...environment.state.versions, version], activeVersionNumber: versionNumber }, value: version,
      auditEvents: [{ id: this.id(), type, actorAccountId: input.accountId, documentId: input.documentId,
        workspaceId: environment.state.workspaceId, occurredAt: iso, metadata: { versionNumber } }] };
  }

  publishVersion(input: BaseDocumentInput & Omit<PublishVersionInput, "expectedRevision">): Promise<CommandResult<DocumentVersionSnapshot>> {
    if (!Number.isInteger(input.versionNumber) || input.versionNumber < 1) throw new CommandValidationError("invalid version number");
    return this.execute(input, "version.publish", (environment) => {
      const target = environment.state.versions.find((version) => version.versionNumber === input.versionNumber);
      if (!target) throw new CommandResourceNotFoundError("version not found");
      if (target.lockedAt) throw new CommandStateError("locked source cannot be published");
      const { iso } = this.timestamp();
      const published = { ...target, status: "Live" as const, publishedAt: iso, publishedByAccountId: input.accountId };
      const versions = environment.state.versions.map((version) => version.id === target.id ? published : version);
      return { state: { ...environment.state, versions, activeVersionNumber: target.versionNumber }, value: published,
        auditEvents: [{ id: this.id(), type: "version.published", actorAccountId: input.accountId, documentId: input.documentId,
          workspaceId: environment.state.workspaceId, occurredAt: iso, metadata: { versionNumber: target.versionNumber } }] };
    });
  }

  lockSource(input: BaseDocumentInput & Omit<LockSourceInput, "expectedRevision">): Promise<CommandResult<DocumentVersionSnapshot>> {
    if (typeof input.locked !== "boolean") throw new CommandValidationError("locked must be boolean");
    return this.execute(input, "source.lock", (environment) => {
      const current = activeVersion(environment.state);
      const { iso } = this.timestamp();
      const updated = input.locked
        ? { ...current, lockedAt: iso, lockedByAccountId: input.accountId }
        : { ...current, lockedAt: undefined, lockedByAccountId: undefined };
      const versions = environment.state.versions.map((version) => version.id === current.id ? updated : version);
      return { state: { ...environment.state, versions }, value: updated,
        auditEvents: [{ id: this.id(), type: input.locked ? "source.locked" : "source.unlocked", actorAccountId: input.accountId,
          documentId: input.documentId, workspaceId: environment.state.workspaceId, occurredAt: iso,
          metadata: { versionNumber: current.versionNumber } }] };
    });
  }

  inviteRoomMember(input: InviteRoomMemberCommand): Promise<CommandResult<RoomInvitationRecord>> {
    assertRole(input.role);
    const normalizedUsername = normalizeUsername(requiredText(input.normalizedUsername, "normalizedUsername", 200));
    if (!normalizedUsername) throw new CommandValidationError("invalid normalized username");
    const expiry = new Date(input.expiresAt);
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= this.now().getTime()) throw new CommandValidationError("invite expiry must be in the future");
    return this.execute(input, "member.manage", (environment) => {
      if (environment.roomInvitations.some((invite) => !invite.acceptedAt && invite.normalizedUsername === normalizedUsername)) {
        throw new CommandStateError("an active invitation already exists");
      }
      const { iso } = this.timestamp();
      const invitation: RoomInvitationRecord = { id: this.id(), documentId: input.documentId, normalizedUsername,
        role: input.role, invitedByAccountId: input.accountId, createdAt: iso, expiresAt: expiry.toISOString() };
      return { state: { ...environment.state }, roomInvitations: [...environment.roomInvitations, invitation], value: invitation,
        auditEvents: [{ id: this.id(), type: "member.invited", actorAccountId: input.accountId, documentId: input.documentId,
          workspaceId: environment.state.workspaceId, occurredAt: iso, metadata: { invitationId: invitation.id, role: invitation.role } }] };
    });
  }

  changeRoomRole(input: ChangeRoomRoleCommand): Promise<CommandResult<RoomRole>> {
    assertRole(input.role);
    return this.execute(input, "member.manage", (environment) => {
      const target = environment.roomMemberships.find((membership) => membership.accountId === input.targetAccountId);
      if (!target) throw new CommandResourceNotFoundError("room member not found");
      if (target.role === "owner") throw new CommandStateError("owner role changes require ownership transfer");
      const { iso } = this.timestamp();
      const roomMemberships = environment.roomMemberships.map((membership) => membership.accountId === input.targetAccountId ? { ...membership, role: input.role } : membership);
      return { state: { ...environment.state }, roomMemberships, value: input.role,
        auditEvents: [{ id: this.id(), type: "member.role_changed", actorAccountId: input.accountId, documentId: input.documentId,
          workspaceId: environment.state.workspaceId, occurredAt: iso, metadata: { targetAccountId: input.targetAccountId, role: input.role } }] };
    });
  }

  removeRoomMember(input: TargetMemberCommand): Promise<CommandResult<AccountId>> {
    return this.execute(input, "member.manage", (environment) => {
      const target = environment.roomMemberships.find((membership) => membership.accountId === input.targetAccountId);
      if (!target) throw new CommandResourceNotFoundError("room member not found");
      if (target.role === "owner") throw new CommandStateError("an owner cannot be removed; transfer ownership first");
      const { iso } = this.timestamp();
      return { state: { ...environment.state }, roomMemberships: environment.roomMemberships.filter((membership) => membership.accountId !== input.targetAccountId),
        value: input.targetAccountId,
        auditEvents: [{ id: this.id(), type: "member.removed", actorAccountId: input.accountId, documentId: input.documentId,
          workspaceId: environment.state.workspaceId, occurredAt: iso, metadata: { targetAccountId: input.targetAccountId } }] };
    });
  }

  transferRoomOwnership(input: TargetMemberCommand): Promise<CommandResult<AccountId>> {
    return this.execute(input, "ownership.transfer", (environment) => {
      const actor = environment.roomMemberships.find((membership) => membership.accountId === input.accountId);
      const target = environment.roomMemberships.find((membership) => membership.accountId === input.targetAccountId);
      if (!actor || actor.role !== "owner") throw new CommandAuthorizationError();
      if (!target) throw new CommandResourceNotFoundError("new owner must already be a direct room member");
      if (target.accountId === actor.accountId) throw new CommandStateError("target is already the acting owner");
      const { iso } = this.timestamp();
      const roomMemberships = environment.roomMemberships.map((membership) => {
        if (membership.accountId === actor.accountId) return { ...membership, role: "collaborator" as const };
        if (membership.accountId === target.accountId) return { ...membership, role: "owner" as const };
        return membership;
      });
      return { state: { ...environment.state }, roomMemberships, value: target.accountId,
        auditEvents: [{ id: this.id(), type: "ownership.transferred", actorAccountId: input.accountId, documentId: input.documentId,
          workspaceId: environment.state.workspaceId, occurredAt: iso, metadata: { newOwnerAccountId: target.accountId } }] };
    });
  }

  archiveRoom(input: BaseDocumentInput): Promise<CommandResult<string>> {
    return this.execute(input, "room.archive", (environment) => {
      const { iso } = this.timestamp();
      return { state: { ...environment.state }, metadata: { documentId: input.documentId, archivedAt: iso, archivedByAccountId: input.accountId }, value: iso,
        auditEvents: [{ id: this.id(), type: "room.archived", actorAccountId: input.accountId, documentId: input.documentId,
          workspaceId: environment.state.workspaceId, occurredAt: iso, metadata: {} }] };
    });
  }

  recordSuccessfulAsk(input: AskMetadataCommand): Promise<CommandResult<AgentRunRecord>> {
    const model = safeOptional(input.model, "model");
    const preset = safeOptional(input.preset, "preset");
    const semanticArtifactFingerprint = safeOptional(input.semanticArtifactFingerprint, "semanticArtifactFingerprint");
    return this.execute(input, "agent.ask", (environment) => {
      const { iso } = this.timestamp();
      const run: AgentRunRecord = { id: this.id(), kind: "ask", actorAccountId: input.accountId, documentId: input.documentId,
        createdAt: iso, outcome: "succeeded", ...(model ? { model } : {}), ...(preset ? { preset } : {}),
        ...(semanticArtifactFingerprint ? { semanticArtifactFingerprint } : {}) };
      return { state: { ...environment.state }, value: run, agentRuns: [run],
        auditEvents: [{ id: this.id(), type: "agent.ask_succeeded", actorAccountId: input.accountId, documentId: input.documentId,
          workspaceId: environment.state.workspaceId, occurredAt: iso,
          metadata: { ...(model ? { model } : {}), ...(preset ? { preset } : {}), ...(semanticArtifactFingerprint ? { semanticArtifactFingerprint } : {}) } }] };
    });
  }

  recordSuccessfulExport(input: BaseDocumentInput): Promise<CommandResult<null>> {
    return this.execute(input, "agent.export", (environment) => {
      const { iso } = this.timestamp();
      return { state: { ...environment.state }, value: null,
        auditEvents: [{ id: this.id(), type: "agent.exported", actorAccountId: input.accountId, documentId: input.documentId,
          workspaceId: environment.state.workspaceId, occurredAt: iso, metadata: {} }] };
    });
  }

  async createDocument(input: CreateDocumentCommand): Promise<DocumentStateV2> {
    const title = requiredText(input.title, "title", MAX_TITLE_LENGTH);
    const html = requiredText(input.html, "html", 5_000_000);
    const semantic = input.semanticArtifact;
    if ((semantic && !input.visualPlan) || (!semantic && input.visualPlan)) throw new CommandValidationError("semantic artifact and visual plan must be supplied together");
    const { iso } = this.timestamp();
    const documentId = this.id();
    const state: DocumentStateV2 = {
      schemaVersion: 2, documentId, workspaceId: input.workspaceId, kind: semantic ? "decision_room" : "legacy",
      revision: 0, title, activeVersionNumber: 1,
      versions: [{ id: this.id(), versionNumber: 1, html, status: "Draft", createdAt: iso, createdByAccountId: input.accountId }],
      comments: [], verdicts: [], ...(semantic ? { semanticArtifact: semantic, visualPlan: input.visualPlan } : {}), capabilities: [],
    };
    return this.repository.createDocumentRecord({ accountId: input.accountId, workspaceId: input.workspaceId, state,
      ownerMembership: { documentId, accountId: input.accountId, role: "owner", createdAt: iso },
      auditEvent: { id: this.id(), type: "document.created", actorAccountId: input.accountId, documentId,
        workspaceId: input.workspaceId, occurredAt: iso, metadata: { kind: state.kind } } });
  }
}
