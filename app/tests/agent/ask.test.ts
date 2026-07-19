import { describe, expect, it } from "vitest";
import type { SemanticArtifact } from "../../src/semantic/types.js";
import {
  buildAskPrompt,
  ASK_MAX_TOKENS,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  isCitableNode,
  materializeGroundedAnswer,
  parseRawAgentAnswer,
  validateRawAgentAnswer,
} from "../../src/agent/ask.js";
import { mockAskDecisionRoom } from "../../src/agent/mock.js";
import {
  AGENT_CRITERIA,
  AGENT_THRESHOLDS,
  buildAgentJudgePrompt,
} from "../../src/agent/rubric.js";

const artifact: SemanticArtifact = {
  schemaVersion: 1,
  id: "room_1",
  sourceFile: "memo.md",
  title: "Launch memo",
  bluf: "Choose option A.",
  thesis: "Option A is supported by the pilot.",
  primaryDecisionId: "decision_1",
  extractedBy: "mock",
  nodes: [
    {
      id: "decision_1", kind: "decision", title: "Choose launch option", summary: "The team should choose option A.",
      question: "Should we choose option A?", status: "under_review", sourceStatus: "explicit",
      sourceRefs: [{ quote: "Choose option A after the pilot.", charStart: 4, charEnd: 35 }],
    },
    {
      id: "assumption_1", kind: "assumption", title: "Demand grows", summary: "Demand will grow.", sourceStatus: "missing_evidence",
      sourceRefs: [{ quote: "We assume demand will grow." }],
    },
  ],
};

describe("grounded Ask", () => {
  it("builds a deterministic semantic-only prompt", () => {
    const first = buildAskPrompt(artifact, "What should we choose?", "founder");
    expect(first).toEqual(buildAskPrompt(artifact, "What should we choose?", "founder"));
    expect(first.system).toContain("Founder");
    expect(first.user).toContain("decision_1");
    expect(first.user).not.toContain("<html");
  });

  it("allowlists canonical semantic fields and does not leak opaque stored state", () => {
    const adversarial = structuredClone(artifact) as SemanticArtifact & Record<string, unknown>;
    adversarial["members"] = [{ email: "secret@example.com" }];
    Object.assign(adversarial.nodes[0]!, {
      rawHtml: "<p>private source</p>",
      token: "super-secret-token",
      members: ["private@example.com"],
    });
    Object.assign(adversarial.nodes[0]!.sourceRefs[0]!, { opaqueState: "must-not-leak" });
    const serialized = buildAskPrompt(adversarial, "What should we choose?", "founder").user;
    expect(serialized).not.toContain("secret@example.com");
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("super-secret-token");
    expect(serialized).not.toContain("private source");
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).toContain("Choose option A after the pilot.");
  });

  it("parses strict JSON and a surrounding JSON fence", () => {
    expect(parseRawAgentAnswer('{"answer":"yes","citations":[]}')).toEqual({ answer: "yes", citations: [] });
    expect(parseRawAgentAnswer('```json\n{"answer":"yes","citations":[]}\n```')).toEqual({ answer: "yes", citations: [] });
    expect(() => parseRawAgentAnswer("Answer: {}")) .toThrow();
  });

  it("rejects all invalid citation paths and citation-free substantive answers", () => {
    const invalids: unknown[] = [
      { answer: "yes", citations: [] },
      { answer: "yes", citations: [{ semanticNodeId: "gone", sourceRefIndex: 0 }] },
      { answer: "yes", citations: [{ semanticNodeId: "decision_1", sourceRefIndex: 2 }] },
      { answer: "yes", citations: [{ semanticNodeId: "decision_1", sourceRefIndex: 0.5 }] },
      { answer: "yes", citations: [{ semanticNodeId: "assumption_1", sourceRefIndex: 0 }] },
      { answer: "yes", citations: [{ semanticNodeId: "decision_1", sourceRefIndex: 0, quote: "model supplied" }] },
      { answer: "yes", citations: [{ semanticNodeId: "decision_1", sourceRefIndex: 0 }], sources: ["model supplied"] },
      { answer: "yes", citations: Array.from({ length: 9 }, () => ({ semanticNodeId: "decision_1", sourceRefIndex: 0 })) },
    ];
    for (const raw of invalids) expect(validateRawAgentAnswer(raw, artifact).valid).toBe(false);
  });

  it("rejects non-object answers, malformed citations, duplicates, and unknown fields", () => {
    for (const raw of [null, "answer", [], 42]) {
      expect(validateRawAgentAnswer(raw, artifact).valid).toBe(false);
    }
    const malformed = [
      { answer: "yes", citations: "not-an-array" },
      { answer: "yes", citations: [null] },
      { answer: "yes", citations: ["decision_1"] },
      { answer: "yes", citations: [{ semanticNodeId: "decision_1", sourceRefIndex: 0 }, { semanticNodeId: "decision_1", sourceRefIndex: 0 }] },
      { answer: "yes", citations: [{ semanticNodeId: "decision_1", sourceRefIndex: 0, quote: "untrusted" }] },
      { answer: "yes", citations: [{ semanticNodeId: "decision_1", sourceRefIndex: 0 }], opaque: true },
    ];
    for (const raw of malformed) expect(validateRawAgentAnswer(raw, artifact).valid).toBe(false);
  });

  it("rejects empty and malformed canonical source refs without throwing", () => {
    const emptyQuote = structuredClone(artifact);
    emptyQuote.nodes[0]!.sourceRefs[0]!.quote = "  ";
    expect(validateRawAgentAnswer({ answer: "yes", citations: [{ semanticNodeId: "decision_1", sourceRefIndex: 0 }] }, emptyQuote).valid).toBe(false);
    expect(isCitableNode(emptyQuote.nodes[0]!)).toBe(false);

    const malformed = structuredClone(artifact);
    (malformed.nodes[0] as unknown as { sourceRefs: unknown }).sourceRefs = [{ quote: 17 }, null];
    expect(() => validateRawAgentAnswer({ answer: "yes", citations: [{ semanticNodeId: "decision_1", sourceRefIndex: 0 }] }, malformed)).not.toThrow();
    expect(validateRawAgentAnswer({ answer: "yes", citations: [{ semanticNodeId: "decision_1", sourceRefIndex: 0 }] }, malformed).valid).toBe(false);
    expect(isCitableNode(malformed.nodes[0]!)).toBe(false);
  });

  it("treats explicit false insufficientEvidence as a substantive grounded answer", () => {
    expect(validateRawAgentAnswer({
      answer: "Choose A.",
      citations: [{ semanticNodeId: "decision_1", sourceRefIndex: 0 }],
      insufficientEvidence: false,
    }, artifact).valid).toBe(true);
  });

  it("accepts only the standard citation-free insufficient-evidence response", () => {
    expect(validateRawAgentAnswer({ answer: INSUFFICIENT_EVIDENCE_MESSAGE, citations: [], insufficientEvidence: true }, artifact).valid).toBe(true);
    expect(validateRawAgentAnswer({ answer: "not enough", citations: [], insufficientEvidence: true }, artifact).valid).toBe(false);
  });

  it("hydrates quote, title, kind, and offsets from canonical state", () => {
    const answer = materializeGroundedAnswer(
      { answer: "Choose A.", citations: [{ semanticNodeId: "decision_1", sourceRefIndex: 0 }] },
      artifact, "founder", "test-model", false
    );
    expect(answer.citations[0]).toMatchObject({ nodeTitle: "Choose launch option", nodeKind: "decision", quote: "Choose option A after the pilot.", charStart: 4, charEnd: 35 });
  });

  it("materialization rejects malformed answers and canonical refs defensively", () => {
    expect(() => materializeGroundedAnswer(
      { answer: "yes", citations: "bad" } as unknown as Parameters<typeof materializeGroundedAnswer>[0],
      artifact, "founder", "test", false
    )).toThrow(/malformed agent answer/);
    const malformed = structuredClone(artifact);
    (malformed.nodes[0] as unknown as { sourceRefs: unknown }).sourceRefs = [{ quote: 17 }];
    expect(() => materializeGroundedAnswer(
      { answer: "yes", citations: [{ semanticNodeId: "decision_1", sourceRefIndex: 0 }] },
      malformed, "founder", "test", false
    )).toThrow(/invalid source ref/);
  });

  it("pins the Ask completion budget to 2,048 tokens", () => {
    expect(ASK_MAX_TOKENS).toBe(2048);
  });

  it("is deterministic in mock mode and never fabricates a citation quote", () => {
    const first = mockAskDecisionRoom(artifact, "What launch option should we choose?", "founder");
    expect(first).toEqual(mockAskDecisionRoom(artifact, "What launch option should we choose?", "founder"));
    expect(first.simulated).toBe(true);
    expect(first.citations[0]?.quote).toBe("Choose option A after the pilot.");
    expect(first.citations.map((citation) => citation.semanticNodeId)).not.toContain("assumption_1");
  });

  it("uses the standard response when no citable evidence exists", () => {
    const noEvidence = { ...artifact, primaryDecisionId: undefined, nodes: [artifact.nodes[1]!] };
    const answer = mockAskDecisionRoom(noEvidence, "What do we know?", "cfo");
    expect(answer).toMatchObject({ answer: INSUFFICIENT_EVIDENCE_MESSAGE, citations: [], insufficientEvidence: true, simulated: true });
  });
});

describe("agent groundedness rubric", () => {
  it("sets the no-support and missing-evidence criteria to zero tolerance", () => {
    expect(AGENT_CRITERIA.filter((criterion) => criterion.zeroTolerance).map((criterion) => criterion.id)).toEqual([
      "b_citation_entailment", "c_no_unsupported_facts_or_numbers", "d_missing_evidence_acknowledgement",
    ]);
    expect([...AGENT_THRESHOLDS.gradedCriteria, ...AGENT_THRESHOLDS.zeroToleranceCriteria].sort()).toEqual(AGENT_CRITERIA.map((criterion) => criterion.id).sort());
  });

  it("builds a deterministic judge prompt", () => {
    const answer = mockAskDecisionRoom(artifact, "What should we choose?", "founder");
    expect(buildAgentJudgePrompt("What should we choose?", artifact, answer)).toBe(buildAgentJudgePrompt("What should we choose?", artifact, answer));
    expect(buildAgentJudgePrompt("What should we choose?", artifact, answer)).toContain("a_citation_completeness");
  });
});
