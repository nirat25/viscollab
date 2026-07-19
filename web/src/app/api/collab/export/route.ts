import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/options";
import { getDocumentRole, getState } from "../db";
import { testSessionFallback } from "../testAuth";
import { canExportAgentData } from "htmlcollab-app/collab";
import { buildDecisionRoomExport } from "htmlcollab-app/agent";
import { validateSemanticArtifact } from "htmlcollab-app/semantic";
import type { AccessRole, Comment } from "htmlcollab-app/collab";
import type { SemanticArtifact } from "htmlcollab-app/semantic";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function response(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeAttachmentFilename(documentId: string): string {
  return `decision-room-${documentId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100)}.json`;
}

function requestId(): string {
  return crypto.randomUUID();
}

/** Exports an allowlisted, canonical semantic-room payload; never raw state. */
export async function GET(request: Request) {
  const id = requestId();
  try {
    const documentId = new URL(request.url).searchParams.get("documentId")?.trim() ?? "";
    if (!documentId || documentId.length > 200) return response({ error: "Invalid request." }, 400);

    let session = await getServerSession(authOptions);
    if (!session) session = testSessionFallback();
    if (!session?.user?.name) return response({ error: "Unauthorized." }, 401);

    const documentRole = await getDocumentRole(documentId, session.user.name);
    if (!documentRole || !canExportAgentData(documentRole as AccessRole)) {
      return response({ error: "Forbidden." }, 403);
    }

    const state: unknown = await getState(documentId);
    if (!isRecord(state)) return response({ error: "Decision room not found." }, 404);
    if (!state.semanticArtifact) return response({ error: "This document is not a decision room." }, 409);

    const validation = validateSemanticArtifact(state.semanticArtifact);
    if (!validation.valid) {
      console.error("Phase-8 export rejected invalid stored artifact", { requestId: id, category: "invalid_stored_artifact" });
      return response({ error: "This decision room needs to be regenerated." }, 422);
    }

    const exported = buildDecisionRoomExport({
      exportedAt: new Date().toISOString(),
      documentId,
      artifact: state.semanticArtifact as SemanticArtifact,
      visualPlan: state.visualPlan,
      comments: Array.isArray(state.comments) ? state.comments as Comment[] : [],
    });
    return NextResponse.json(exported, {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Disposition": `attachment; filename="${safeAttachmentFilename(documentId)}"`,
      },
    });
  } catch (error) {
    console.error("Phase-8 export handler failure", { requestId: id, category: "internal_failure" });
    return response({ error: "Unable to export this room right now." }, 500);
  }
}
