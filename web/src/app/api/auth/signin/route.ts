import { NextResponse } from "next/server";
import { normalizeUsername } from "htmlcollab-app/persistence";
import { persistenceRepository } from "@/server/persistence";
import { verifyPassword } from "@/server/auth/password";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const normalizedUsername = normalizeUsername(username);
    const user = normalizedUsername ? await (await persistenceRepository()).getAccountByNormalizedUsername(normalizedUsername) : null;

    if (!user) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      user: { accountId: user.id, name: user.username },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to signin" }, { status: 500 });
  }
}
