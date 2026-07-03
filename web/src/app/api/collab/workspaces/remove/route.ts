import { NextRequest, NextResponse } from "next/server";
import { getWorkspaces, saveWorkspaces } from "../../db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/options";

export async function DELETE(req: NextRequest) {
  let session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { workspaceId, username } = body;
  
  if (!workspaceId || !username) {
    return NextResponse.json({ error: "workspaceId and username are required" }, { status: 400 });
  }

  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((w: any) => w.id === workspaceId);

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Check if current user is an admin of this workspace
  const currentUserMember = workspace.members.find((m: any) => m.username.toLowerCase() === session!.user!.name!.toLowerCase());
  if (!currentUserMember || (currentUserMember.role !== 'admin' && currentUserMember.role !== 'owner')) {
    return NextResponse.json({ error: "Only admins or owners can remove users from a workspace" }, { status: 403 });
  }

  if (username.toLowerCase() === session!.user!.name!.toLowerCase()) {
    return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
  }

  const initialLength = workspace.members.length;
  workspace.members = workspace.members.filter((m: any) => m.username.toLowerCase() !== username.toLowerCase());

  if (workspace.members.length === initialLength) {
    return NextResponse.json({ error: "User is not in the workspace" }, { status: 404 });
  }

  await saveWorkspaces(workspaces);

  return NextResponse.json({ success: true, message: "User removed successfully", workspace });
}
