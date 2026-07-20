import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { persistenceRepository, workspaceCatalogProjection } from "@/server/persistence";
import { requireAccountSession } from "@/server/auth/session";

export async function GET(request: Request) {
  const session = await requireAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const repository = await persistenceRepository();
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (workspaceId) {
      const workspace = (await repository.listWorkspaces(session.accountId)).find((item) => item.id === workspaceId);
      if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      return NextResponse.json({ ...workspaceCatalogProjection(session.accountId, workspace), members: await repository.listWorkspaceMembers(session.accountId, workspaceId) });
    }
    return NextResponse.json((await repository.listWorkspaces(session.accountId)).map((workspace) => workspaceCatalogProjection(session.accountId, workspace)));
  } catch {
    return NextResponse.json({ error: "Failed to fetch workspaces" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 512) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const now = new Date().toISOString();
    const id = randomUUID();
    const workspace = await (await persistenceRepository()).createWorkspace({
      accountId: session.accountId,
      workspace: { id, name, ownerAccountId: session.accountId, createdAt: now, updatedAt: now },
      ownerMembership: { workspaceId: id, accountId: session.accountId, role: "owner", createdAt: now },
    });
    return NextResponse.json(workspaceCatalogProjection(session.accountId, workspace), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create workspace" }, { status: 500 });
  }
}
