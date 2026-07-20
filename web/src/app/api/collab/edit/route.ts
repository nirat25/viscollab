import { PersistenceCommandService } from "@/server/persistence";
import { hasLlmKey } from "../llm";
import { simulateEdit, validateEditRequest, validateLlmSectionResult } from "htmlcollab-app/edit";
import {
  expectedRevision, isRecord, noStore, persistenceErrorResponse, persistenceRepository,
  requiredString, revisionConflict, sessionAccountId,
} from "../phase9";

export const dynamic = "force-dynamic";
const REQUEST_KEYS = new Set(["documentId", "sectionId", "sectionHtml", "instruction", "expectedRevision"]);

function escapeForRegex(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** Surgical edit reads canonical active source and persists only through editVersion. */
export async function POST(request: Request) {
  const accountId = await sessionAccountId();
  if (!accountId) return noStore({ success: false, error: "unauthorized" }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return noStore({ success: false, error: "invalid_request" }, 400); }
  if (!isRecord(body) || Object.keys(body).some((key) => !REQUEST_KEYS.has(key)) || validateEditRequest(body).length > 0) {
    return noStore({ success: false, error: "invalid_request" }, 400);
  }
  const documentId = requiredString(body.documentId);
  const sectionId = requiredString(body.sectionId);
  const sectionHtml = requiredString(body.sectionHtml, 1_000_000);
  const instruction = requiredString(body.instruction, 20_000);
  const revision = expectedRevision(body.expectedRevision);
  if (!documentId || !sectionId || !sectionHtml || !instruction || revision === null) return noStore({ success: false, error: "invalid_request" }, 400);
  try {
    const repository = await persistenceRepository();
    const room = await repository.readRoom(accountId, documentId);
    if (!room || !room.capabilities.includes("room.edit")) return noStore({ success: false, error: "forbidden" }, 403);
    if (room.state.revision !== revision) return revisionConflict(room.state.revision);
    if (!hasLlmKey()) {
      // Simulation is intentionally non-persistent, but still account/capability scoped.
      return noStore({ success: true, html: simulateEdit(sectionHtml, sectionId, instruction), simulated: true, revision: room.state.revision });
    }
    const active = room.state.versions.find((version) => version.versionNumber === room.state.activeVersionNumber);
    if (!active) return noStore({ success: false, error: "invalid_stored_state" }, 409);
    const { performSurgicalEdit } = await import("htmlcollab-app/edit");
    const updatedDocumentHtml = await performSurgicalEdit(active.html, sectionId, instruction);
    const idAttrRe = new RegExp(`<([a-zA-Z][a-zA-Z0-9-]*)\\b[^>]*\\bid\\s*=\\s*["']${escapeForRegex(sectionId)}["'][^>]*>[\\s\\S]*?</\\1>`, "i");
    const updatedSectionHtml = updatedDocumentHtml.match(idAttrRe)?.[0] ?? updatedDocumentHtml;
    const contractError = validateLlmSectionResult(updatedSectionHtml, sectionId);
    if (contractError) return noStore({ success: false, error: "invalid_provider_output" }, 422);
    const result = await new PersistenceCommandService(repository).editVersion({ accountId, documentId, expectedRevision: revision, html: updatedDocumentHtml });
    if (!result.ok) return revisionConflict(result.currentRevision);
    return noStore({ success: true, html: updatedSectionHtml, simulated: false, revision: result.state.revision });
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}
