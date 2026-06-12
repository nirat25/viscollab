import { NextResponse } from "next/server";
import { getUsers } from "../../collab/db";

export async function POST(request: Request) {
  try {
    const { token } = await request.json();
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const users = await getUsers();
    const user = users.find((u: any) => u.token === token);

    if (!user) {
      return NextResponse.json({ success: false, error: "Invalid token" }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      user: { name: user.username, role: user.role },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to validate token" }, { status: 500 });
  }
}
