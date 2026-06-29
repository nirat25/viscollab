import { NextResponse } from "next/server";
import { getUsers, saveUsers, hashPassword } from "../../collab/db";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const { username, password, role } = await request.json();
    if (!username || !password || !role) {
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
        // Complete signup for invited user
        existingUser.passwordHash = hashPassword(password);
        existingUser.token = crypto.randomBytes(16).toString("hex");
        await saveUsers(users);
        return NextResponse.json({
          success: true,
          token: existingUser.token,
          user: { name: existingUser.username, role: existingUser.role },
        });
      }
    }

    return NextResponse.json({ error: "Signups are restricted to invited members only." }, { status: 403 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to signup" }, { status: 500 });
  }
}
