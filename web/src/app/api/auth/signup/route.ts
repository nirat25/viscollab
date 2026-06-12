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
      return NextResponse.json({ error: "User already exists" }, { status: 400 });
    }

    const token = crypto.randomBytes(16).toString("hex");
    const newUser = {
      username,
      passwordHash: hashPassword(password),
      role,
      token,
    };

    users.push(newUser);
    await saveUsers(users);

    return NextResponse.json({
      success: true,
      token,
      user: { name: username, role },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to signup" }, { status: 500 });
  }
}
