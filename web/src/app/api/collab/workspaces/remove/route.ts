import { NextResponse } from "next/server";
import { normalizeUsername } from "htmlcollab-app/persistence";
import { persistenceRepository } from "@/server/persistence";
import { requireAccountSession } from "@/server/auth/session";

export async function DELETE(request: Request) {
  const session = await requireAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    const normalizedUsername = normalizeUsername(body.username);
    if (!workspaceId || !normalizedUsername) return NextResponse.json({ error: "workspaceId and username are required" }, { status: 400 });
    const repository = await persistenceRepository();
    const account = await repository.getAccountByNormalizedUsername(normalizedUsername);
    if (!account) return NextResponse.json({ error: "Workspace member not found" }, { status: 404 });
    await repository.removeWorkspaceMember({ accountId: session.accountId, workspaceId, targetAccountId: account.id });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const status = error?.status === 403 ? 403 : /not found/.test(error?.message ?? "") ? 404 : /owner/.test(error?.message ?? "") ? 409 : 500;
    return NextResponse.json({ error: status === 500 ? "Failed to remove workspace member" : error.message }, { status });
  }
}
