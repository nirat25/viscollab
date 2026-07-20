import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { normalizeUsername } from "htmlcollab-app/persistence";
import { persistenceRepository } from "@/server/persistence";
import { hashPassword } from "@/server/auth/password";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username.normalize("NFKC").trim() : "";
    const password = body.password;
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername || typeof password !== "string") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const repository = await persistenceRepository();
    if (await repository.getAccountByNormalizedUsername(normalizedUsername)) {
      return NextResponse.json({ error: "User already exists" }, { status: 409 });
    }
    const now = new Date().toISOString();
    const account = await repository.createAccount({ id: randomUUID(), username, normalizedUsername, passwordHash: hashPassword(password), createdAt: now, updatedAt: now });
    return NextResponse.json({ success: true, user: { accountId: account.id, name: account.username } }, { status: 201 });
  } catch (e: any) {
    const status = /password must/.test(e?.message ?? "") ? 400 : 500;
    return NextResponse.json({ error: status === 400 ? e.message : "Failed to signup" }, { status });
  }
}
