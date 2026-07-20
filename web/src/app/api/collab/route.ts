import { noStore, persistenceErrorResponse, persistenceRepository, requiredString, sessionAccountId } from "./phase9";

export const dynamic = "force-dynamic";

/** Account-scoped room read.  There is deliberately no implicit demo/default room. */
export async function GET(request: Request) {
  const accountId = await sessionAccountId();
  if (!accountId) return noStore({ error: "unauthorized" }, 401);
  const documentId = requiredString(new URL(request.url).searchParams.get("documentId"));
  if (!documentId) return noStore({ error: "invalid_request" }, 400);
  try {
    const room = await (await persistenceRepository()).readRoom(accountId, documentId);
    // Do not reveal whether a document exists to a non-member.
    if (!room) return noStore({ error: "forbidden" }, 403);
    return noStore(room.state);
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}

/** Collection/blob writes were retired in Phase 9. Use /api/collab/commands. */
export async function POST() {
  return noStore({ error: "narrow_commands_required" }, 405);
}
