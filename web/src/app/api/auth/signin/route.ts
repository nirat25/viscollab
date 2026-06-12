import { NextResponse } from "next/server";
import { getUsers, hashPassword } from "../../collab/db";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const users = await getUsers();
    const user = users.find(
      (u: any) => u.username?.toLowerCase() === username.toLowerCase()
    );

    if (!user) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const hash = hashPassword(password);
    if (user.passwordHash !== hash) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      token: user.token,
      user: { name: user.username, role: user.role },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to signin" }, { status: 500 });
  }
}
