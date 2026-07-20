import { PersistenceCommandService } from "@/server/persistence";
import { hasLlmKey } from "../llm";
import {
  expectedRevision, isRecord, noStore, persistenceErrorResponse, persistenceRepository,
  requiredString, revisionConflict, sessionAccountId,
} from "../phase9";

export const dynamic = "force-dynamic";
const REQUEST_KEYS = new Set(["documentId", "lockedIds", "expectedRevision"]);

function validLockedIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 100 && value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 200);
}

/** Regeneration creates a new server-derived version; it never accepts version/state blobs. */
export async function POST(request: Request) {
  const accountId = await sessionAccountId();
  if (!accountId) return noStore({ success: false, error: "unauthorized" }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return noStore({ success: false, error: "invalid_request" }, 400); }
  if (!isRecord(body) || Object.keys(body).some((key) => !REQUEST_KEYS.has(key))) return noStore({ success: false, error: "invalid_request" }, 400);
  const documentId = requiredString(body.documentId);
  const revision = expectedRevision(body.expectedRevision);
  const lockedIds = body.lockedIds === undefined ? [] : body.lockedIds;
  if (!documentId || revision === null || !validLockedIds(lockedIds)) return noStore({ success: false, error: "invalid_request" }, 400);
  try {
    const repository = await persistenceRepository();
    const room = await repository.readRoom(accountId, documentId);
    if (!room || !room.capabilities.includes("version.regenerate")) return noStore({ success: false, error: "forbidden" }, 403);
    if (room.state.revision !== revision) return revisionConflict(room.state.revision);
    const active = room.state.versions.find((version) => version.versionNumber === room.state.activeVersionNumber);
    if (!active || active.status !== "Draft") return noStore({ success: false, error: "invalid_state_transition" }, 409);
    let generatedHtml: string;
    let warnings: string[] = [];
    if (hasLlmKey()) {
      const [{ runPipeline }, { splicePreservedSections }, { validateDisclosure }] = await Promise.all([
        import("htmlcollab-app/pipeline"), import("htmlcollab-app/collab"), import("htmlcollab-app/render"),
      ]);
      const result = await runPipeline({ kind: "gdoc-html", gdocHtml: active.html, fileName: "regenerated-draft" });
      generatedHtml = result.html;
      if (lockedIds.length) generatedHtml = splicePreservedSections(active.html, generatedHtml, new Set(lockedIds));
      const disclosure = validateDisclosure(generatedHtml);
      if (!disclosure.valid) return noStore({ success: false, error: "invalid_provider_output" }, 422);
      warnings = disclosure.warnings ?? result.disclosure?.warnings ?? [];
    } else {
      generatedHtml = active.html.replace(/<body[^>]*>/i, (match) => `${match}\n<div class="vc-mock-regeneration">This is a simulated regeneration of the Draft document.</div>`);
      if (lockedIds.length) {
        const { splicePreservedSections } = await import("htmlcollab-app/collab");
        generatedHtml = splicePreservedSections(active.html, generatedHtml, new Set(lockedIds));
      }
    }
    const result = await new PersistenceCommandService(repository).regenerateVersion({ accountId, documentId, expectedRevision: revision, generatedHtml });
    if (!result.ok) return revisionConflict(result.currentRevision);
    return noStore({ success: true, html: generatedHtml, simulated: !hasLlmKey(), warnings, revision: result.state.revision });
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}
