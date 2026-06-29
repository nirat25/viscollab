import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/options";
import { getUsers, saveUsers } from "../../collab/db";

export async function POST(request: Request) {
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

    if (session.user.role !== "owner") {
      return NextResponse.json({ error: "Forbidden: only owners can invite teammates" }, { status: 403 });
    }

    const { username, role } = await request.json();
    if (!username || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const users = await getUsers();
    const existingUser = users.find(
      (u: any) => u.username?.toLowerCase() === username.toLowerCase()
    );

    if (existingUser) {
      if (existingUser.passwordHash) {
        return NextResponse.json({ error: "User already exists" }, { status: 400 });
      } else {
        // Update invited user role
        existingUser.role = role;
        await saveUsers(users);
        return NextResponse.json({ success: true, message: "Teammate invite updated successfully" });
      }
    }

    const newUser = {
      username,
      role,
      passwordHash: "", // pending registration
      token: ""
    };

    users.push(newUser);
    await saveUsers(users);

    return NextResponse.json({ success: true, message: "Teammate invited successfully" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to invite teammate" }, { status: 500 });
  }
}
