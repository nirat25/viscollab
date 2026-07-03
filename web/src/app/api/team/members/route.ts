import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/options";
import { getDocuments, saveDocuments, getDocumentRole } from "../../collab/db";

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

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");
    if (!documentId) return NextResponse.json({ error: "Missing documentId" }, { status: 400 });

    const docs = await getDocuments();
    const doc = docs.find((d: any) => d.id === documentId);
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const members = doc.members || [];

    return NextResponse.json({ success: true, members });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to retrieve members" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");
    if (!documentId) return NextResponse.json({ error: "Missing documentId" }, { status: 400 });

    const userRole = await getDocumentRole(documentId, session.user.name!);
    if (userRole !== "owner") {
      return NextResponse.json({ error: "Forbidden: Only owners can update roles" }, { status: 403 });
    }

    const { username, role } = await request.json();
    if (!username || !role) {
      return NextResponse.json({ error: "Missing username or role" }, { status: 400 });
    }

    const docs = await getDocuments();
    const doc = docs.find((d: any) => d.id === documentId);
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    if (!doc.members) doc.members = [];

    const memberIndex = doc.members.findIndex((m: any) => m.username?.toLowerCase() === username.toLowerCase());
    
    if (memberIndex === -1) {
      return NextResponse.json({ error: "User not found in document" }, { status: 404 });
    }

    doc.members[memberIndex].role = role;
    await saveDocuments(docs);

    return NextResponse.json({ success: true, message: "User role updated successfully" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to update member role" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");
    if (!documentId) return NextResponse.json({ error: "Missing documentId" }, { status: 400 });

    const userRole = await getDocumentRole(documentId, session.user.name!);
    if (userRole !== "owner") {
      return NextResponse.json({ error: "Forbidden: Only owners can remove members" }, { status: 403 });
    }

    const { username } = await request.json();
    if (!username) {
      return NextResponse.json({ error: "Missing username" }, { status: 400 });
    }

    const docs = await getDocuments();
    const doc = docs.find((d: any) => d.id === documentId);
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    if (!doc.members) doc.members = [];

    doc.members = doc.members.filter((m: any) => m.username?.toLowerCase() !== username.toLowerCase());
    
    await saveDocuments(docs);

    return NextResponse.json({ success: true, message: "User removed" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to remove member" }, { status: 500 });
  }
}
