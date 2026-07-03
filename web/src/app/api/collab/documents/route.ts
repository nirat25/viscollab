import { NextResponse } from "next/server";
import { getDocuments, saveDocuments, saveState } from "../db";
import crypto from "crypto";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/options";

export async function GET(request: Request) {
  try {
    let session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    
    let documents = await getDocuments();
    if (workspaceId) {
      documents = documents.filter((doc: any) => doc.workspaceId === workspaceId);
    }
    return NextResponse.json({ success: true, documents });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to fetch documents" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, html, workspaceId } = await request.json();
    if (!name || !html || !workspaceId) {
      return NextResponse.json({ error: "Missing name, html or workspaceId" }, { status: 400 });
    }

    const documentId = `doc-${crypto.randomUUID()}`;
    const newDoc = {
      id: documentId,
      name,
      workspaceId,
      createdAt: new Date().toISOString(),
      members: [
        { username: session.user.name || "", role: "owner" }
      ]
    };

    const documents = await getDocuments();
    documents.push(newDoc);
    await saveDocuments(documents);

    const initialState = {
      versions: [
        {
          versionNumber: 1,
          html: html,
          status: "Draft",
          timestamp: new Date().toISOString()
        }
      ],
      activeVersionNum: 1,
      comments: [],
      verdicts: {
        "Sam": null,
        "Alex": null,
        "Priya": null,
        "Nirat": null
      }
    };

    await saveState(initialState, documentId);

    return NextResponse.json({ success: true, document: newDoc });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create document" }, { status: 500 });
  }
}
