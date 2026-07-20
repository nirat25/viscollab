import { buildDecisionRoomExport } from "htmlcollab-app/agent";
import { validateSemanticArtifact } from "htmlcollab-app/semantic";
import { PersistenceCommandService } from "@/server/persistence";
import {
  expectedRevision, isRecord, noStore, persistenceErrorResponse, persistenceRepository,
  requiredString, revisionConflict, sessionAccountId,
} from "../phase9";

export const dynamic = "force-dynamic";
const REQUEST_KEYS = new Set(["documentId", "expectedRevision"]);

function safeAttachmentFilename(documentId: string): string {
  return `decision-room-${documentId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100)}.json`;
}

/**
 * Export is a material user action, so it is a POST with a revision guard.
 * It creates only an audit record (never an agent run) after payload assembly.
 */
export async function POST(request: Request) {
  const accountId = await sessionAccountId();
  if (!accountId) return noStore({ error: "unauthorized" }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return noStore({ error: "invalid_request" }, 400); }
  if (!isRecord(body) || Object.keys(body).some((key) => !REQUEST_KEYS.has(key))) return noStore({ error: "invalid_request" }, 400);
  const documentId = requiredString(body.documentId);
  const revision = expectedRevision(body.expectedRevision);
  if (!documentId || revision === null) return noStore({ error: "invalid_request" }, 400);
  try {
    const repository = await persistenceRepository();
    const room = await repository.readRoom(accountId, documentId);
    if (!room || !room.capabilities.includes("agent.export")) return noStore({ error: "forbidden" }, 403);
    if (room.state.revision !== revision) return revisionConflict(room.state.revision);
    const artifact = room.state.semanticArtifact;
    if (!artifact) return noStore({ error: "not_a_decision_room" }, 409);
    if (!validateSemanticArtifact(artifact).valid) return noStore({ error: "invalid_stored_artifact" }, 422);
    const exported = buildDecisionRoomExport({
      exportedAt: new Date().toISOString(), documentId, artifact,
      visualPlan: room.state.visualPlan, comments: [...room.state.comments],
    });
    const recorded = await new PersistenceCommandService(repository).recordSuccessfulExport({ accountId, documentId, expectedRevision: revision });
    if (!recorded.ok) return revisionConflict(recorded.currentRevision);
    return noStore(exported, 200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeAttachmentFilename(documentId)}"`,
      "X-Content-Type-Options": "nosniff",
      "X-Room-Revision": String(recorded.state.revision),
    });
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}

export async function GET() { return noStore({ error: "post_required" }, 405); }
