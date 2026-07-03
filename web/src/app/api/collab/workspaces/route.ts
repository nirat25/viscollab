import { NextRequest, NextResponse } from "next/server";
import { getWorkspaces, createWorkspace } from "../db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/options";
export async function GET(req: NextRequest) {
  let session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaces = await getWorkspaces();
  // Filter workspaces to only those the user is a member of
  const userWorkspaces = workspaces.filter(ws => 
    ws.members.some((m: any) => m.username.toLowerCase() === session!.user!.name!.toLowerCase())
  );

  return NextResponse.json(userWorkspaces);
}

export async function POST(req: NextRequest) {
  let session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name } = body;
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const id = "ws-" + Math.random().toString(36).substring(2, 9);
  const newWorkspace = await createWorkspace(id, name, session!.user!.name!);

  return NextResponse.json(newWorkspace);
}
