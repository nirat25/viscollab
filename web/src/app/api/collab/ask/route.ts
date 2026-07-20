import { AGENT_PRESETS, askDecisionRoom, mockAskDecisionRoom } from "htmlcollab-app/agent";
import { fingerprintSemanticArtifact } from "htmlcollab-app/persistence";
import { validateSemanticArtifact } from "htmlcollab-app/semantic";
import type { AgentPreset } from "htmlcollab-app/agent";
import { PersistenceCommandService } from "@/server/persistence";
import { hasLlmKey } from "../llm";
import {
  expectedRevision, isRecord, noStore, persistenceErrorResponse, persistenceRepository,
  requiredString, revisionConflict, sessionAccountId,
} from "../phase9";

export const dynamic = "force-dynamic";

const MAX_QUESTION_LENGTH = 2_000;
const REQUEST_KEYS = new Set(["documentId", "question", "preset", "expectedRevision"]);

function isAgentPreset(value: unknown): value is AgentPreset {
  return typeof value === "string" && (AGENT_PRESETS as readonly string[]).includes(value);
}

function mockMode(): boolean { return process.env.MOCK_AI === "true"; }

/** The client supplies a question only; the server loads the authorized canonical artifact. */
export async function POST(request: Request) {
  const accountId = await sessionAccountId();
  if (!accountId) return noStore({ error: "unauthorized" }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return noStore({ error: "invalid_request" }, 400); }
  if (!isRecord(body) || Object.keys(body).some((key) => !REQUEST_KEYS.has(key))) return noStore({ error: "invalid_request" }, 400);
  const documentId = requiredString(body.documentId);
  const question = requiredString(body.question, MAX_QUESTION_LENGTH);
  const revision = expectedRevision(body.expectedRevision);
  if (!documentId || !question || revision === null || !isAgentPreset(body.preset)) return noStore({ error: "invalid_request" }, 400);

  try {
    const repository = await persistenceRepository();
    const room = await repository.readRoom(accountId, documentId);
    if (!room) return noStore({ error: "forbidden" }, 403);
    if (!room.capabilities.includes("agent.ask")) return noStore({ error: "forbidden" }, 403);
    // Avoid invoking a provider when a known-stale client cannot record the
    // required success metadata against the current canonical room.
    if (room.state.revision !== revision) return revisionConflict(room.state.revision);
    const artifact = room.state.semanticArtifact;
    if (!artifact) return noStore({ error: "not_a_decision_room" }, 409);
    if (!validateSemanticArtifact(artifact).valid) return noStore({ error: "invalid_stored_artifact" }, 422);
    const mock = mockMode();
    if (!mock && !hasLlmKey()) return noStore({ error: "assistant_unavailable" }, 503);
    const answer = mock ? mockAskDecisionRoom(artifact, question, body.preset) : await askDecisionRoom(artifact, question, body.preset);
    // This is intentionally after a successful provider call. It stores no question or answer.
    const recorded = await new PersistenceCommandService(repository).recordSuccessfulAsk({
      accountId, documentId, expectedRevision: revision,
      model: mock ? "mock" : "configured", preset: body.preset,
      semanticArtifactFingerprint: fingerprintSemanticArtifact(artifact),
    });
    if (!recorded.ok) return revisionConflict(recorded.currentRevision);
    return noStore({ answer, revision: recorded.state.revision });
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}
