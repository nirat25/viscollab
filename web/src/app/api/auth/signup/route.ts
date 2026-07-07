import { NextResponse } from "next/server";
import { getUsers, saveUsers, hashPasswordWithSalt } from "../../collab/db";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
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
        // Complete signup for invited user. Keep the pre-assigned role (the
        // invite already scoped their access); only set credentials here.
        const { salt, hash } = hashPasswordWithSalt(password);
        existingUser.passwordSalt = salt;
        existingUser.passwordHash = hash;
        existingUser.token = crypto.randomBytes(16).toString("hex");
        await saveUsers(users);
        return NextResponse.json({
          success: true,
          token: existingUser.token,
          user: { name: existingUser.username, role: existingUser.role },
        });
      }
    }

    // New self-registered users get a neutral base global role. Ownership is
    // granted per-resource (workspace creator -> workspace owner; document
    // creator -> document owner), never globally at signup. Any client-supplied
    // elevated role is intentionally ignored.
    const { salt, hash } = hashPasswordWithSalt(password);
    const newUser = {
      username,
      role: "collaborator",
      passwordSalt: salt,
      passwordHash: hash,
      token: crypto.randomBytes(16).toString("hex"),
    };
    users.push(newUser);
    await saveUsers(users);

    return NextResponse.json({
      success: true,
      token: newUser.token,
      user: { name: newUser.username, role: newUser.role },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to signup" }, { status: 500 });
  }
}
