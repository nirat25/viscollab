import { NextResponse } from "next/server";
import { normalizeUsername } from "htmlcollab-app/persistence";
import { PersistenceCommandService, persistenceRepository } from "@/server/persistence";
import { requireAccountSession } from "@/server/auth/session";

function revision(value: unknown): number | null { return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null; }

export async function POST(request: Request) {
  const session = await requireAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const documentId = typeof body.documentId === "string" ? body.documentId : "";
    const expectedRevision = revision(body.expectedRevision);
    const normalizedUsername = normalizeUsername(body.username);
    if (!documentId || expectedRevision === null || !normalizedUsername || !["viewer", "commenter", "collaborator"].includes(body.role)) {
      return NextResponse.json({ error: "documentId, expectedRevision, account username, and a non-owner room role are required" }, { status: 400 });
    }
    // Pending invitations are intentionally allowed before account creation.
    // They become usable only after the signed-in account with this normalized
    // username explicitly accepts, at which point direct room membership is made.
    const result = await new PersistenceCommandService(await persistenceRepository()).inviteRoomMember({
      accountId: session.accountId, documentId, expectedRevision, normalizedUsername, role: body.role,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (!result.ok) return NextResponse.json(result, { status: 409 });
    return NextResponse.json({ success: true, invitation: result.value, revision: result.state.revision }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.status === 403 ? "Forbidden" : error?.message ?? "Failed to invite teammate" }, { status: error?.status === 403 ? 403 : 400 });
  }
}

export async function PUT(request: Request) {
  const session = await requireAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const expectedRevision = revision(body.expectedRevision);
    if (typeof body.documentId !== "string" || typeof body.invitationId !== "string" || expectedRevision === null) {
      return NextResponse.json({ error: "documentId, invitationId, and expectedRevision are required" }, { status: 400 });
    }
    const result = await (await persistenceRepository()).acceptRoomInvitation({ accountId: session.accountId, documentId: body.documentId, invitationId: body.invitationId, expectedRevision });
    return result.ok ? NextResponse.json({ success: true, revision: result.state.revision }) : NextResponse.json(result, { status: 409 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.status === 403 ? "Invitation is unavailable" : "Failed to accept invitation" }, { status: error?.status === 403 ? 403 : 500 });
  }
}
