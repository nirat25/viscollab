import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { normalizeUsername } from "htmlcollab-app/persistence";
import { persistenceRepository } from "@/server/persistence";
import { requireAccountSession } from "@/server/auth/session";

export async function POST(request: Request) {
  const session = await requireAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    const normalizedUsername = normalizeUsername(body.username);
    if (!workspaceId || !normalizedUsername || (body.role !== undefined && body.role !== "member")) {
      return NextResponse.json({ error: "workspaceId and invitee username are required" }, { status: 400 });
    }
    const now = new Date();
    const invitation = await (await persistenceRepository()).createWorkspaceInvitation({
      accountId: session.accountId, workspaceId,
      invitation: { id: randomUUID(), workspaceId, normalizedUsername, role: "member", invitedByAccountId: session.accountId, createdAt: now.toISOString(), expiresAt: new Date(now.valueOf() + 7 * 24 * 60 * 60 * 1000).toISOString() },
    });
    return NextResponse.json({ success: true, invitation }, { status: 201 });
  } catch (error: any) {
    const status = error?.status === 403 ? 403 : /already|does not exist/.test(error?.message ?? "") ? 409 : 500;
    return NextResponse.json({ error: status === 500 ? "Failed to add workspace member" : error.message }, { status });
  }
}

export async function PUT(request: Request) {
  const session = await requireAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    if (typeof body.workspaceId !== "string" || typeof body.invitationId !== "string") return NextResponse.json({ error: "workspaceId and invitationId are required" }, { status: 400 });
    await (await persistenceRepository()).acceptWorkspaceInvitation({ accountId: session.accountId, workspaceId: body.workspaceId, invitationId: body.invitationId });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.status === 403 ? "Invitation is unavailable" : "Failed to accept workspace invitation" }, { status: error?.status === 403 ? 403 : 500 });
  }
}
