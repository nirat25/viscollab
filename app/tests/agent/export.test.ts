import { describe, expect, it } from "vitest";
import { buildDecisionRoomExport } from "../../src/agent/export.js";
import type { Comment } from "../../src/collab/comments.js";
import type { SemanticArtifact } from "../../src/semantic/types.js";

const artifact: SemanticArtifact = {
  schemaVersion: 1, id: "artifact-export", sourceFile: "memo.md", title: "Memo", bluf: "BLUF", thesis: "Thesis", extractedBy: "mock",
  nodes: [
    { id: "decision_1", kind: "decision", title: "Decide", summary: "Decide", question: "Proceed?", sourceRefs: [{ quote: "Proceed" }], sourceStatus: "explicit" },
    { id: "action_1", kind: "action", title: "Open action", summary: "Do it", sourceRefs: [{ quote: "Do it" }], sourceStatus: "explicit" },
    { id: "action_2", kind: "action", title: "Closed action", summary: "Done", sourceRefs: [{ quote: "Done" }], sourceStatus: "explicit", done: true },
  ],
};

function comment(id: string, lifecycle: Comment["lifecycle"], feedbackType: Comment["feedbackType"]): Comment {
  return { id, versionId: "v1", author: "Alex", body: `${id} body`, createdAt: 100, feedbackType, lifecycle, anchorStatus: "anchored", target: { type: "semantic", artifactId: artifact.id, semanticNodeId: "decision_1", visualBlockId: "vb_decisionBrief" }, lastKnownContext: "", resolution: null, replies: [{ id: `${id}-reply`, author: "Nirat", body: "Reply", mentions: [], ts: 101 }], mentions: [], history: [] };
}

describe("buildDecisionRoomExport", () => {
  it("exports deterministic review data and no persistence-only state", () => {
    const output = buildDecisionRoomExport({ exportedAt: "2026-07-19T00:00:00.000Z", documentId: "doc-1", artifact, visualPlan: { blocks: [{}] }, comments: [comment("open-flag", "open", "flag"), comment("open-question", "open", "question"), comment("resolved", "resolved", null)] });
    expect(output).toMatchObject({ schemaVersion: 1, documentId: "doc-1", artifactId: artifact.id });
    expect(output.visualPlan.artifactId).toBe(artifact.id);
    expect(output.commentsSummary.counts).toEqual({ total: 3, open: 2, resolved: 1, blockers: 1, questions: 1 });
    expect(output.commentsSummary.openThreads.map((thread) => thread.commentId)).toEqual(["open-flag", "open-question"]);
    expect(output.commentsSummary.openThreads[0]).toMatchObject({ semanticNodeId: "decision_1", visualBlockId: "vb_decisionBrief", replies: [{ id: "open-flag-reply", author: "Nirat", body: "Reply", ts: 101 }] });
    expect(output.openActions.map((node) => node.id)).toEqual(["action_1"]);
    expect(JSON.stringify(output)).not.toMatch(/versionId|lastKnownContext|mentions|history|resolution/);
  });

  it("reconstructs canonical artifact data and strips arbitrary persisted fields", () => {
    const poisoned = structuredClone(artifact) as SemanticArtifact & Record<string, unknown>;
    poisoned.token = "top-secret-token";
    poisoned.members = ["private-member"];
    poisoned.rawHtml = "<script>private raw html</script>";
    Object.assign(poisoned.nodes[1]!, {
      token: "node-secret",
      members: ["node-member"],
      rawHtml: "node raw html",
    });
    Object.assign(poisoned.nodes[1]!.sourceRefs[0]!, { token: "ref-secret", rawHtml: "ref html" });
    Object.assign(poisoned.nodes[1]!.relationships ??= {}, {
      dependsOn: ["decision_1"],
      members: ["relationship-member"],
    });

    const output = buildDecisionRoomExport({
      exportedAt: "2026-07-19T00:00:00.000Z",
      documentId: "doc-poisoned",
      artifact: poisoned,
      visualPlan: { schemaVersion: 1, artifactId: artifact.id, blocks: [], token: "plan-secret" },
      comments: [],
    });
    const serialized = JSON.stringify(output);
    expect(serialized).not.toMatch(/top-secret|private-member|raw html|node-secret|node-member|ref-secret|ref html|relationship-member|plan-secret/);
    expect(output.semanticArtifact.nodes[1]).toEqual({
      id: "action_1",
      kind: "action",
      title: "Open action",
      summary: "Do it",
      sourceRefs: [{ quote: "Do it" }],
      sourceStatus: "explicit",
      relationships: { dependsOn: ["decision_1"] },
    });
    expect(output.openActions).toEqual([output.semanticArtifact.nodes[1]]);
    expect(output.openActions[0]).not.toBe(poisoned.nodes[1]);
  });

  it("fails closed when the stored semantic artifact is invalid", () => {
    const invalid = structuredClone(artifact);
    invalid.nodes[0]!.sourceRefs = [{ quote: "" }];
    expect(() => buildDecisionRoomExport({
      exportedAt: "2026-07-19T00:00:00.000Z",
      documentId: "doc-invalid",
      artifact: invalid,
      comments: [],
    })).toThrow("Invalid semantic artifact");
  });

  it("preserves a valid stored plan while stripping unknown plan fields", () => {
    const storedPlan = {
      schemaVersion: 1 as const,
      artifactId: artifact.id,
      token: "plan-secret",
      blocks: [{
        id: "vb_stored_brief",
        kind: "decisionBrief" as const,
        title: "Stored brief title",
        nodeIds: ["decision_1"],
        decisionId: "decision_1",
        keyOptionIds: [],
        keyRiskIds: [],
        keyActionIds: [],
        rawHtml: "private",
      }],
    };
    const output = buildDecisionRoomExport({
      exportedAt: "2026-07-19T00:00:00.000Z",
      documentId: "doc-plan",
      artifact,
      visualPlan: storedPlan,
      comments: [],
    });
    expect(output.visualPlan.blocks).toEqual([{
      id: "vb_stored_brief",
      kind: "decisionBrief",
      title: "Stored brief title",
      nodeIds: ["decision_1"],
      decisionId: "decision_1",
      keyOptionIds: [],
      keyRiskIds: [],
      keyActionIds: [],
    }]);
    expect(JSON.stringify(output.visualPlan)).not.toMatch(/plan-secret|private/);
  });
});
