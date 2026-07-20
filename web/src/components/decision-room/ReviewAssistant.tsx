"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AGENT_PRESETS,
  AGENT_PRESET_LABELS,
  generateAgentBrief,
  type AgentPreset,
  type GroundedAgentAnswer,
} from "htmlcollab-app/agent/client";
import type { SemanticArtifact } from "htmlcollab-app/semantic";
import type { DocumentStateV2 } from "htmlcollab-app/persistence";

export interface ReviewAssistantProps {
  documentId: string;
  artifact: SemanticArtifact;
  expectedRevision: number;
  onState: (state: DocumentStateV2) => void;
  onRevision?: (revision: number) => void;
  onAccessLost?: () => void;
}

/** One-shot, grounded review request. Deliberately not a persistent chat UI. */
export default function ReviewAssistant({ documentId, artifact, expectedRevision, onState, onRevision, onAccessLost }: ReviewAssistantProps) {
  const [preset, setPreset] = useState<AgentPreset>("founder");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<GroundedAgentAnswer | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const suggestions = useMemo(
    () => generateAgentBrief(artifact).suggestedQuestions.slice(0, 5),
    [artifact]
  );

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isLoading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError("");
    setAnswer(null);

    try {
      const response = await fetch("/api/collab/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ documentId, question: trimmedQuestion, preset, expectedRevision }),
      });
      const payload: unknown = await response.json();
      if (response.status === 401 || response.status === 403) {
        onAccessLost?.();
      }
      if (!response.ok || !payload || typeof payload !== "object" || !("answer" in payload)) {
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Unable to review this room right now.";
        throw new Error(message);
      }
      setAnswer((payload as { answer: GroundedAgentAnswer }).answer);
      const state = (payload as { state?: unknown }).state;
      if (state && typeof state === "object" && (state as { schemaVersion?: unknown }).schemaVersion === 2) {
        onState(state as DocumentStateV2);
      }
      const revision = (payload as { revision?: unknown }).revision;
      if (typeof revision === "number" && Number.isInteger(revision) && revision >= 0) onRevision?.(revision);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : "Unable to review this room right now.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="dr-review-assistant" aria-labelledby="review-assistant-title">
      <div className="dr-review-assistant-heading">
        <div>
          <h3 id="review-assistant-title">Review assistant</h3>
          <p>Ask one grounded question about this room.</p>
        </div>
      </div>

      <form className="dr-review-assistant-form" onSubmit={handleSubmit}>
        <label className="dr-review-assistant-label" htmlFor={`review-perspective-${documentId}`}>
          Review perspective
        </label>
        <select
          id={`review-perspective-${documentId}`}
          className="dr-select dr-review-assistant-select"
          value={preset}
          onChange={(event) => setPreset(event.target.value as AgentPreset)}
        >
          {AGENT_PRESETS.map((value) => <option key={value} value={value}>{AGENT_PRESET_LABELS[value]}</option>)}
        </select>

        {suggestions.length > 0 && (
          <div className="dr-review-suggestions" aria-label="Suggested questions">
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.text}:${suggestion.semanticNodeIds.join(",")}`}
                type="button"
                className="dr-review-suggestion"
                onClick={() => setQuestion(suggestion.text)}
              >
                {suggestion.text}
              </button>
            ))}
          </div>
        )}

        <label className="dr-review-assistant-label" htmlFor={`review-question-${documentId}`}>
          Your question
        </label>
        <textarea
          id={`review-question-${documentId}`}
          className="dr-review-question"
          value={question}
          rows={3}
          maxLength={2000}
          placeholder="What needs attention before this decision moves forward?"
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button className="dr-review-ask-button" type="submit" disabled={isLoading || !question.trim()}>
          Ask
        </button>
      </form>

      {isLoading && <p className="dr-review-status" role="status" aria-live="polite">Reviewing the room…</p>}
      {error && <p className="dr-review-error" role="alert">{error}</p>}
      {answer && (
        <div className="dr-review-answer" aria-live="polite">
          <p>{answer.answer}</p>
          {answer.citations.length > 0 && (
            <div className="dr-review-citations" aria-label="Grounding citations">
              {answer.citations.map((citation) => (
                <span
                  key={`${citation.semanticNodeId}-${citation.sourceRefIndex}`}
                  className="dr-review-citation"
                  title={citation.quote}
                >
                  {citation.nodeTitle}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
