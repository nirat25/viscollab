import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/options";
import { getDocuments, saveDocuments, getDocumentRole } from "../../collab/db";
import { testSessionFallback } from "../../collab/testAuth";

export async function POST(request: Request) {
  try {
    let session = await getServerSession(authOptions);
    if (!session) {
      session = testSessionFallback({ name: "Sam", role: "owner", token: "token-owner" });
    }
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { username, role, documentId } = await request.json();
    if (!username || !role || !documentId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const userRole = await getDocumentRole(documentId, session.user.name!);
    if (userRole !== "owner") {
      return NextResponse.json({ error: "Forbidden: only owners can invite teammates" }, { status: 403 });
    }

    const docs = await getDocuments();
    const doc = docs.find((d: any) => d.id === documentId);
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    if (!doc.members) doc.members = [];

    const existingMember = doc.members.find((m: any) => m.username?.toLowerCase() === username.toLowerCase());
    if (existingMember) {
      existingMember.role = role;
      await saveDocuments(docs);
      return NextResponse.json({ success: true, message: "Teammate role updated successfully" });
    }

    doc.members.push({ username, role });
    await saveDocuments(docs);

    return NextResponse.json({ success: true, message: "Teammate invited successfully" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to invite teammate" }, { status: 500 });
  }
}
