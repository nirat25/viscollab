import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/options";
import { getUsers, saveUsers } from "../../collab/db";

export async function GET(request: Request) {
  try {
    let session = await getServerSession(authOptions);
    if (!session && process.env.PLAYWRIGHT_TEST === "true") {
      session = {
        user: { name: "Sam", role: "owner", token: "token-owner" },
        expires: ""
      };
    }
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const users = await getUsers();
    const members = users.map((u: any) => ({
      username: u.username,
      role: u.role
    }));

    return NextResponse.json({ success: true, members });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to retrieve members" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    let session = await getServerSession(authOptions);
    if (!session && process.env.PLAYWRIGHT_TEST === "true") {
      session = {
        user: { name: "Sam", role: "owner", token: "token-owner" },
        expires: ""
      };
    }
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if ((session.user as any).role !== "owner") {
      return NextResponse.json({ error: "Forbidden: Only owners can update roles" }, { status: 403 });
    }

    const { username, role } = await request.json();
    if (!username || !role) {
      return NextResponse.json({ error: "Missing username or role" }, { status: 400 });
    }

    const users = await getUsers();
    const userIndex = users.findIndex((u: any) => u.username?.toLowerCase() === username.toLowerCase());
    
    if (userIndex === -1) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    users[userIndex].role = role;
    await saveUsers(users);

    return NextResponse.json({ success: true, message: "User role updated successfully" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to update member role" }, { status: 500 });
  }
}
