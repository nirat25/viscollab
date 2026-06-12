import { NextResponse } from "next/server";
import { getDocuments, saveDocuments, saveState } from "../db";
import crypto from "crypto";

export async function GET() {
  try {
    const documents = await getDocuments();
    return NextResponse.json({ success: true, documents });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to fetch documents" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, html } = await request.json();
    if (!name || !html) {
      return NextResponse.json({ error: "Missing name or html" }, { status: 400 });
    }

    const documentId = `doc-${crypto.randomUUID()}`;
    const newDoc = {
      id: documentId,
      name,
      createdAt: new Date().toISOString()
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
