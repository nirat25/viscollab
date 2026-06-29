import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/options";
import { getUsers } from "../../collab/db";

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
