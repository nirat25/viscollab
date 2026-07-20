/** Server-owned Phase-9 capability matrix. Unknown roles always deny. */

import type {
  AuthorizationContext,
  AuthorizationResource,
  AuthorizationSubject,
  Capability,
  RoomRole,
} from "./types.js";

const ROLE_CAPABILITIES: Readonly<Record<RoomRole, readonly Capability[]>> = {
  viewer: ["room.read", "agent.ask"],
  commenter: [
    "room.read", "agent.ask", "comment.create", "comment.reply", "verdict.set_self",
    "comment.resolve", "comment.reopen",
  ],
  collaborator: [
    "room.read", "agent.ask", "comment.create", "comment.reply", "verdict.set_self",
    "comment.resolve", "comment.reopen", "room.edit", "version.create",
    "version.regenerate", "source.lock", "agent.export",
  ],
  owner: [
    "room.read", "agent.ask", "comment.create", "comment.reply", "verdict.set_self",
    "comment.resolve", "comment.reopen", "room.edit", "version.create",
    "version.regenerate", "source.lock", "agent.export", "version.publish",
    "member.manage", "room.archive", "ownership.transfer",
  ],
};

const WORKSPACE_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "workspace.create_document", "workspace.member_manage",
]);

function isRoomRole(value: unknown): value is RoomRole {
  return value === "viewer" || value === "commenter" || value === "collaborator" || value === "owner";
}

export function capabilitiesForRole(role: unknown): readonly Capability[] {
  return isRoomRole(role) ? ROLE_CAPABILITIES[role] : [];
}

/**
 * Single server authorization predicate.  The resource must be loaded from
 * direct membership before this call; clients cannot provide a role/context.
 */
export function authorize(
  subject: AuthorizationSubject,
  resource: AuthorizationResource,
  capability: Capability,
  context: AuthorizationContext = {},
): boolean {
  if (!subject || typeof subject.accountId !== "string" || subject.accountId.trim() === "") return false;
  if (WORKSPACE_CAPABILITIES.has(capability)) {
    return resource.workspaceRole === "owner" && context.workspaceOwnerAccountId === subject.accountId;
  }

  const role = resource.roomRole;
  if (!isRoomRole(role) || !capabilitiesForRole(role).includes(capability)) return false;

  if (capability === "comment.resolve" || capability === "comment.reopen") {
    // Commenters may operate on only their own thread; higher roles may operate on any.
    return role === "collaborator" || role === "owner" || context.threadAuthorAccountId === subject.accountId;
  }
  return true;
}

export function canAuthorizeAny(
  subject: AuthorizationSubject,
  resource: AuthorizationResource,
  capabilities: readonly Capability[],
  context: AuthorizationContext = {},
): boolean {
  return capabilities.some((capability) => authorize(subject, resource, capability, context));
}
