import { PersistenceCommandService, type CommandResult } from "@/server/persistence";
import type { AccountId, DocumentStateV2 } from "htmlcollab-app/persistence";
import {
  expectedRevision,
  isRecord,
  noStore,
  persistenceErrorResponse,
  persistenceRepository,
  requiredString,
  revisionConflict,
  sessionAccountId,
} from "../phase9";

export const dynamic = "force-dynamic";

const COMMON_KEYS = new Set(["documentId", "command", "expectedRevision"]);
const COMMAND_KEYS: Readonly<Record<string, readonly string[]>> = {
  createComment: ["body", "target", "feedbackType"],
  replyToComment: ["threadId", "body"],
  resolveComment: ["threadId"],
  reopenComment: ["threadId"],
  setOwnVerdict: ["verdict"],
  createVersion: ["html"],
  editVersion: ["html"],
  regenerateVersion: ["generatedHtml"],
  publishVersion: ["versionNumber"],
  lockSource: ["locked"],
  inviteRoomMember: ["normalizedUsername", "role", "expiresAt"],
  changeRoomRole: ["targetAccountId", "role"],
  removeRoomMember: ["targetAccountId"],
  transferRoomOwnership: ["targetAccountId"],
  archiveRoom: [],
};

function allowedBody(body: Record<string, unknown>): boolean {
  const command = body.command;
  if (typeof command !== "string" || !COMMAND_KEYS[command]) return false;
  const allowed = new Set([...COMMON_KEYS, ...COMMAND_KEYS[command]]);
  return Object.keys(body).every((key) => allowed.has(key));
}

function dispatch(service: PersistenceCommandService, accountId: AccountId, body: Record<string, unknown>) {
  const documentId = requiredString(body.documentId);
  const revision = expectedRevision(body.expectedRevision);
  if (!documentId || revision === null) return null;
  const base = { accountId, documentId, expectedRevision: revision };
  switch (body.command) {
    case "createComment": return service.createComment({ ...base, body: body.body as string, target: body.target as never, feedbackType: body.feedbackType as never });
    case "replyToComment": return service.replyToComment({ ...base, threadId: body.threadId as string, body: body.body as string });
    case "resolveComment": return service.resolveComment({ ...base, threadId: body.threadId as string });
    case "reopenComment": return service.reopenComment({ ...base, threadId: body.threadId as string });
    case "setOwnVerdict": return service.setOwnVerdict({ ...base, verdict: body.verdict as never });
    case "createVersion": return service.createVersion({ ...base, html: body.html as string });
    case "editVersion": return service.editVersion({ ...base, html: body.html as string });
    case "regenerateVersion": return service.regenerateVersion({ ...base, generatedHtml: body.generatedHtml as string });
    case "publishVersion": return service.publishVersion({ ...base, versionNumber: body.versionNumber as number });
    case "lockSource": return service.lockSource({ ...base, locked: body.locked as boolean });
    case "inviteRoomMember": return service.inviteRoomMember({ ...base, normalizedUsername: body.normalizedUsername as string, role: body.role as never, expiresAt: body.expiresAt as string });
    case "changeRoomRole": return service.changeRoomRole({ ...base, targetAccountId: body.targetAccountId as string, role: body.role as never });
    case "removeRoomMember": return service.removeRoomMember({ ...base, targetAccountId: body.targetAccountId as string });
    case "transferRoomOwnership": return service.transferRoomOwnership({ ...base, targetAccountId: body.targetAccountId as string });
    case "archiveRoom": return service.archiveRoom(base);
    default: return null;
  }
}

export async function POST(request: Request) {
  const accountId = await sessionAccountId();
  if (!accountId) return noStore({ error: "unauthorized" }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return noStore({ error: "invalid_request" }, 400); }
  if (!isRecord(body) || !allowedBody(body)) return noStore({ error: "invalid_request" }, 400);

  try {
    const repository = await persistenceRepository();
    const result = dispatch(new PersistenceCommandService(repository), accountId, body);
    if (!result) return noStore({ error: "invalid_request" }, 400);
    const completed = await result as CommandResult<unknown>;
    if (!completed.ok) return revisionConflict(completed.currentRevision);
    const room = await repository.readRoom(accountId, completed.state.documentId);
    // Membership removal / ownership commands may intentionally revoke access.
    return noStore({ success: true, value: completed.value, state: room?.state ?? null, revision: completed.state.revision });
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}
