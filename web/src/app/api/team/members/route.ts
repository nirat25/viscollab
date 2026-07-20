import { NextResponse } from "next/server";
import { normalizeUsername } from "htmlcollab-app/persistence";
import { PersistenceCommandService, persistenceRepository } from "@/server/persistence";
import { requireAccountSession } from "@/server/auth/session";

function revision(value: unknown): number | null { return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null; }
async function targetAccount(username: unknown) {
  const normalized = normalizeUsername(username);
  return normalized ? (await persistenceRepository()).getAccountByNormalizedUsername(normalized) : null;
}

export async function GET(request: Request) {
  const session = await requireAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const documentId = new URL(request.url).searchParams.get("documentId");
  if (!documentId) return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
  try {
    return NextResponse.json({ success: true, members: await (await persistenceRepository()).listRoomMembers(session.accountId, documentId) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.status === 403 ? "Forbidden" : "Document not found" }, { status: error?.status ?? 404 });
  }
}

export async function PUT(request: Request) {
  const session = await requireAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const expectedRevision = revision(body.expectedRevision);
    const target = await targetAccount(body.username);
    if (!body.documentId || expectedRevision === null || !target || !["viewer", "commenter", "collaborator"].includes(body.role)) return NextResponse.json({ error: "documentId, expectedRevision, existing username, and a non-owner role are required" }, { status: 400 });
    const result = await new PersistenceCommandService(await persistenceRepository()).changeRoomRole({ accountId: session.accountId, documentId: body.documentId, expectedRevision, targetAccountId: target.id, role: body.role });
    return result.ok ? NextResponse.json({ success: true, revision: result.state.revision }) : NextResponse.json(result, { status: 409 });
  } catch (error: any) { return NextResponse.json({ error: error?.status === 403 ? "Forbidden" : error?.message ?? "Failed to update member" }, { status: error?.status === 403 ? 403 : 400 }); }
}

export async function DELETE(request: Request) {
  const session = await requireAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const expectedRevision = revision(body.expectedRevision);
    const target = await targetAccount(body.username);
    if (!body.documentId || expectedRevision === null || !target) return NextResponse.json({ error: "documentId, expectedRevision, and an existing username are required" }, { status: 400 });
    const result = await new PersistenceCommandService(await persistenceRepository()).removeRoomMember({ accountId: session.accountId, documentId: body.documentId, expectedRevision, targetAccountId: target.id });
    return result.ok ? NextResponse.json({ success: true, revision: result.state.revision }) : NextResponse.json(result, { status: 409 });
  } catch (error: any) { return NextResponse.json({ error: error?.status === 403 ? "Forbidden" : error?.message ?? "Failed to remove member" }, { status: error?.status === 403 ? 403 : 400 }); }
}
