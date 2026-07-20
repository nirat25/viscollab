import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Token-based identity was retired in Phase 9. NextAuth owns the signed
  // session cookie; this endpoint intentionally cannot validate bearer-like
  // opaque values into an account.
  await request.text();
  return NextResponse.json({ error: "Token validation is retired; use the account session." }, { status: 410 });
}
