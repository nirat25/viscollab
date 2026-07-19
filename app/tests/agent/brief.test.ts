import { describe, expect, it } from "vitest";
import { generateAgentBrief } from "../../src/agent/brief.js";
import { validateAgentBrief } from "../../src/agent/schema.js";
import { AGENT_PRESETS, AGENT_PRESET_LENS_GUIDANCE } from "../../src/agent/types.js";
import type { SemanticArtifact } from "../../src/semantic/types.js";

const artifact: SemanticArtifact = {
  schemaVersion: 1,
  id: "artifact-agent-test",
  sourceFile: "memo.md",
  title: "Memo",
  bluf: "Choose a direction.",
  thesis: "A decision is required.",
  extractedBy: "mock",
  nodes: [
    { id: "decision_1", kind: "decision", title: "Ship", summary: "Ship now", question: "Should we ship?", sourceRefs: [{ quote: "Ship" }], sourceStatus: "explicit", status: "under_review" },
    { id: "decision_2", kind: "decision", title: "Blocked", summary: "Blocked", question: "What unblocks this?", sourceRefs: [{ quote: "Blocked" }], sourceStatus: "explicit", status: "blocked" },
    { id: "risk_1", kind: "risk", title: "Dependency", summary: "A dependency blocks delivery", sourceRefs: [{ quote: "dependency" }], sourceStatus: "explicit", relationships: { blocks: ["decision_1"] } },
    { id: "assumption_1", kind: "assumption", title: "Demand", summary: "Demand will exist", sourceRefs: [], sourceStatus: "missing_evidence" },
    { id: "action_1", kind: "action", title: "Validate", summary: "Validate demand", sourceRefs: [{ quote: "Validate" }], sourceStatus: "explicit" },
    { id: "action_2", kind: "action", title: "Done", summary: "Done", sourceRefs: [{ quote: "Done" }], sourceStatus: "explicit", done: true },
    { id: "question_1", kind: "question", title: "Budget", summary: "What is the budget?", sourceRefs: [{ quote: "budget" }], sourceStatus: "explicit" },
  ],
};

describe("AgentBrief", () => {
  it("classifies open work deterministically without mutating the artifact", () => {
    const before = structuredClone(artifact);
    const first = generateAgentBrief(artifact);
    expect(first).toEqual(generateAgentBrief(artifact));
    expect(artifact).toEqual(before);
    expect(first.decisionsNeeded).toEqual(["decision_1", "decision_2"]);
    expect(first.blockers).toEqual(["decision_2", "risk_1"]);
    expect(first.unsupportedAssumptions).toEqual(["assumption_1"]);
    expect(first.actionItems).toEqual(["action_1"]);
    expect(first.suggestedQuestions[0]).toEqual({ text: "What is the budget?", semanticNodeIds: ["question_1"] });
    expect(first.suggestedQuestions.length).toBeLessThanOrEqual(8);
    expect(first.followUpTasks).toEqual([
      { semanticNodeId: "assumption_1", reason: "validate_assumption" },
      { semanticNodeId: "action_1", reason: "open_action" },
      { semanticNodeId: "question_1", reason: "open_question" },
    ]);
    expect(validateAgentBrief(first, artifact)).toEqual({ valid: true, errors: [] });
  });

  it("fails closed on dangling, wrong-kind, duplicate, and ungrounded values", () => {
    const invalid = structuredClone(generateAgentBrief(artifact));
    invalid.decisionsNeeded = ["risk_1", "risk_1", "missing"];
    invalid.suggestedQuestions = [{ text: " ", semanticNodeIds: [] }];
    invalid.followUpTasks = [{ semanticNodeId: "question_1", reason: "open_action" }];
    const result = validateAgentBrief(invalid, artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toMatch(/wrong-kind|duplicate|dangling|empty text|ungrounded|invalid follow-up/);
  });

  it("is valid and bounded for a sparse artifact", () => {
    const sparse: SemanticArtifact = { ...artifact, id: "sparse", nodes: [] };
    const brief = generateAgentBrief(sparse);
    expect(brief).toMatchObject({ schemaVersion: 1, artifactId: "sparse" });
    expect(brief.suggestedQuestions).toEqual([]);
    expect(validateAgentBrief(brief, sparse).valid).toBe(true);
  });

  it("exports the fixed preset allowlist and non-empty lens guidance", () => {
    expect(AGENT_PRESETS).toEqual(["founder", "cfo", "cto", "pm", "investor"]);
    for (const preset of AGENT_PRESETS) expect(AGENT_PRESET_LENS_GUIDANCE[preset]).not.toEqual("");
  });

  it("caps suggested questions at eight in stable artifact order", () => {
    const manyQuestions: SemanticArtifact = {
      ...artifact,
      id: "many-questions",
      primaryDecisionId: undefined,
      nodes: Array.from({ length: 10 }, (_, index) => ({
        id: `question_${index + 1}`,
        kind: "question" as const,
        title: `Question ${index + 1}`,
        summary: `What about item ${index + 1}?`,
        sourceRefs: [{ quote: `Item ${index + 1}` }],
        sourceStatus: "explicit" as const,
      })),
    };
    const brief = generateAgentBrief(manyQuestions);
    expect(brief.suggestedQuestions).toHaveLength(8);
    expect(brief.suggestedQuestions.map((question) => question.semanticNodeIds[0])).toEqual(
      Array.from({ length: 8 }, (_, index) => `question_${index + 1}`)
    );
  });

  it("does not classify an evidence-supported explicit assumption as unsupported", () => {
    const supported: SemanticArtifact = {
      ...artifact,
      id: "supported-assumption",
      nodes: [
        ...artifact.nodes,
        {
          id: "assumption_2",
          kind: "assumption",
          title: "Supported premise",
          summary: "The pilot supports this premise.",
          sourceRefs: [{ quote: "pilot supports" }],
          sourceStatus: "explicit",
        },
        {
          id: "evidence_1",
          kind: "evidence",
          title: "Pilot evidence",
          summary: "The pilot supports the premise.",
          sourceRefs: [{ quote: "pilot supports" }],
          sourceStatus: "explicit",
          relationships: { supports: ["assumption_2"] },
        },
      ],
    };
    expect(generateAgentBrief(supported).unsupportedAssumptions).not.toContain("assumption_2");
  });
});
