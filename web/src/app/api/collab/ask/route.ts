import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/options";
import { getDocumentRole, getState } from "../db";
import { checkAndIncrementLimit } from "../limits";
import { hasLlmKey } from "../llm";
import { isTestBypassEnabled, testSessionFallback } from "../testAuth";
import { AGENT_PRESETS, askDecisionRoom, mockAskDecisionRoom } from "htmlcollab-app/agent";
import { validateSemanticArtifact } from "htmlcollab-app/semantic";
import type { AgentPreset } from "htmlcollab-app/agent";
import type { SemanticArtifact } from "htmlcollab-app/semantic";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };
const MAX_QUESTION_LENGTH = 2_000;
const REQUEST_KEYS = new Set(["documentId", "question", "preset"]);

function response(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgentPreset(value: unknown): value is AgentPreset {
  return typeof value === "string" && (AGENT_PRESETS as readonly string[]).includes(value);
}

function isExplicitMockMode(): boolean {
  return process.env.MOCK_AI === "true" || isTestBypassEnabled();
}

function requestId(): string {
  return crypto.randomUUID();
}

/** Phase-8 grounded Ask endpoint. The browser sends no artifact or room state. */
export async function POST(request: Request) {
  const id = requestId();
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return response({ error: "Invalid request." }, 400);
    }
    if (!isRecord(body) || Object.keys(body).some((key) => !REQUEST_KEYS.has(key))) {
      return response({ error: "Invalid request." }, 400);
    }

    const documentId = typeof body.documentId === "string" ? body.documentId.trim() : "";
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const preset = body.preset;
    if (
      !documentId || documentId.length > 200 ||
      !question || question.length > MAX_QUESTION_LENGTH ||
      !isAgentPreset(preset)
    ) {
      return response({ error: "Invalid request." }, 400);
    }

    let session = await getServerSession(authOptions);
    if (!session) session = testSessionFallback();
    if (!session?.user?.name) return response({ error: "Unauthorized." }, 401);

    const documentRole = await getDocumentRole(documentId, session.user.name);
    if (!documentRole) return response({ error: "Forbidden." }, 403);

    const state: unknown = await getState(documentId);
    if (!isRecord(state)) return response({ error: "Decision room not found." }, 404);
    if (!state.semanticArtifact) return response({ error: "This document is not a decision room." }, 409);

    const artifactValidation = validateSemanticArtifact(state.semanticArtifact);
    if (!artifactValidation.valid) {
      console.error("Phase-8 Ask rejected invalid stored artifact", { requestId: id, category: "invalid_stored_artifact" });
      return response({ error: "This decision room needs to be regenerated." }, 422);
    }
    const artifact = state.semanticArtifact as SemanticArtifact;
    const limit = await checkAndIncrementLimit(session.user.name, "ask");
    if (!limit.allowed) return response({ error: "You have reached today’s review-assistant limit." }, 429);

    const mock = isExplicitMockMode();
    if (!mock && !hasLlmKey()) return response({ error: "Review assistant is unavailable." }, 503);

    try {
      const answer = mock
        ? mockAskDecisionRoom(artifact, question, preset)
        : await askDecisionRoom(artifact, question, preset);
      return response({ answer });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const isInvalidOutput = /malformed|ungrounded|Ask JSON/i.test(message);
      console.error("Phase-8 Ask provider failure", {
        requestId: id,
        category: isInvalidOutput ? "invalid_provider_output" : "provider_unavailable",
      });
      return response(
        { error: isInvalidOutput ? "The review assistant returned an invalid grounded answer." : "Review assistant is unavailable." },
        isInvalidOutput ? 502 : 503
      );
    }
  } catch (error) {
    console.error("Phase-8 Ask handler failure", { requestId: id, category: "internal_failure" });
    return response({ error: "Unable to review this room right now." }, 500);
  }
}
