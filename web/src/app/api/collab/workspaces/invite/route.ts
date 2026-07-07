import { NextRequest, NextResponse } from "next/server";
import { getWorkspaces, saveWorkspaces } from "../../db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/options";

export async function POST(req: NextRequest) {
  let session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { workspaceId, username, role } = body;
  
  if (!workspaceId || !username || !role) {
    return NextResponse.json({ error: "workspaceId, username, and role are required" }, { status: 400 });
  }

  const workspaces = await getWorkspaces();
  const workspace = workspaces.find(w => w.id === workspaceId);

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Check if current user is an owner/admin of this workspace
  const currentUserMember = workspace.members.find((m: any) => m.username.toLowerCase() === session!.user!.name!.toLowerCase());
  if (!currentUserMember || !['owner', 'admin'].includes(currentUserMember.role)) {
    return NextResponse.json({ error: "Only workspace owners can invite users to a workspace" }, { status: 403 });
  }

  // Check if user is already a member
  const existingMember = workspace.members.find((m: any) => m.username.toLowerCase() === username.toLowerCase());
  if (existingMember) {
    existingMember.role = role;
  } else {
    workspace.members.push({ username, role });
  }

  await saveWorkspaces(workspaces);

  return NextResponse.json({ success: true, workspace });
}
