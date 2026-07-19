/**
 * SEM-005 deterministic tests: validateSemanticArtifact (SEM-002)
 *
 * Covers the one passing golden fixture plus one failing case per rule in
 * docs/rebuild-architecture.md §5.3 (7 rules). All offline, no keys, deterministic.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSemanticArtifact } from "../../src/semantic/schema.js";
import type { SemanticArtifact } from "../../src/semantic/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "../fixtures/semantic");

function loadArtifact(name: string): SemanticArtifact {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as SemanticArtifact;
}

/** Minimal, schema-valid artifact used as a base for the failing-case tests below. */
function baseArtifact(): SemanticArtifact {
  return {
    schemaVersion: 1,
    id: "artifact_test",
    sourceFile: "test.md",
    title: "Test Artifact",
    bluf: "Test bluf.",
    thesis: "Test thesis.",
    primaryDecisionId: "decision_1",
    extractedBy: "mock",
    nodes: [
      {
        id: "decision_1",
        kind: "decision",
        title: "Decide something",
        summary: "A decision summary.",
        question: "Should we do the thing?",
        sourceStatus: "explicit",
        sourceRefs: [{ quote: "Should we do the thing?" }],
      },
      {
        id: "risk_1",
        kind: "risk",
        title: "A risk",
        summary: "A risk summary.",
        sourceStatus: "explicit",
        sourceRefs: [{ quote: "some risk text" }],
        relationships: { blocks: ["decision_1"] },
      },
    ],
  };
}

/** Deep-clone so mutations in one test can't leak into another. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("validateSemanticArtifact — passing fixtures", () => {
  it("accepts the founder-memo golden artifact", () => {
    const artifact = loadArtifact("founder-memo.artifact.json");
    const result = validateSemanticArtifact(artifact);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("accepts the dentaltechhub golden artifact", () => {
    const artifact = loadArtifact("dentaltechhub.artifact.json");
    const result = validateSemanticArtifact(artifact);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("accepts the minimal base artifact used by the failing-case tests", () => {
    const result = validateSemanticArtifact(baseArtifact());
    expect(result.valid).toBe(true);
  });
});

describe("validateSemanticArtifact — one failing case per rule", () => {
  it("rule 1: duplicate node ids", () => {
    const artifact = clone(baseArtifact());
    artifact.nodes[1]!.id = "decision_1"; // collides with nodes[0]
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("duplicate node id"))).toBe(true);
  });

  it("rule 2: empty sourceRefs without sourceStatus missing_evidence", () => {
    const artifact = clone(baseArtifact());
    artifact.nodes[1]!.sourceRefs = [];
    // sourceStatus stays "explicit" — should error.
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("empty sourceRefs"))).toBe(true);
  });

  it("rule 2 (negative control): empty sourceRefs IS allowed when sourceStatus is missing_evidence", () => {
    const artifact = clone(baseArtifact());
    artifact.nodes[1]!.sourceRefs = [];
    artifact.nodes[1]!.sourceStatus = "missing_evidence";
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(true);
  });

  it("rule 3: dangling relationship id", () => {
    const artifact = clone(baseArtifact());
    artifact.nodes[1]!.relationships = { blocks: ["does_not_exist"] };
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("dangling relationship id"))).toBe(true);
  });

  it("rule 4: invalid kind outside the 10-kind union", () => {
    const artifact = clone(baseArtifact()) as unknown as { nodes: Array<Record<string, unknown>> };
    artifact.nodes[1]!["kind"] = "not_a_real_kind";
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("invalid kind"))).toBe(true);
  });

  it("rule 5: primaryDecisionId set but no matching decision node", () => {
    const artifact = clone(baseArtifact());
    artifact.primaryDecisionId = "decision_does_not_exist";
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("primaryDecisionId"))).toBe(true);
  });

  it("rule 6: decision node with empty question", () => {
    const artifact = clone(baseArtifact());
    (artifact.nodes[0] as { question: string }).question = "";
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("missing decision summary"))).toBe(true);
  });

  it("rule 6: decision node with empty summary", () => {
    const artifact = clone(baseArtifact());
    artifact.nodes[0]!.summary = "   "; // whitespace-only counts as empty
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("missing decision summary"))).toBe(true);
  });

  it("rule 7: schemaVersion !== 1", () => {
    const artifact = clone(baseArtifact()) as unknown as { schemaVersion: number };
    artifact.schemaVersion = 2;
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("invalid schemaVersion"))).toBe(true);
  });
});

describe("validateSemanticArtifact — defensive shape handling on unknown input", () => {
  it("rejects null without throwing", () => {
    expect(() => validateSemanticArtifact(null)).not.toThrow();
    expect(validateSemanticArtifact(null).valid).toBe(false);
  });

  it("rejects a primitive without throwing", () => {
    const result = validateSemanticArtifact("not an artifact");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects an object missing nodes without throwing", () => {
    const result = validateSemanticArtifact({ schemaVersion: 1 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("nodes is not an array"))).toBe(true);
  });

  it("rejects an empty object without throwing", () => {
    expect(() => validateSemanticArtifact({})).not.toThrow();
  });
});

describe("rule 8: missing node id (review hardening)", () => {
  it("rejects a node without a string id", () => {
    const artifact = clone(baseArtifact());
    delete (artifact.nodes[1] as Partial<(typeof artifact.nodes)[1]>).id;
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("missing node id"))).toBe(true);
  });

  it("rejects a non-string id", () => {
    const artifact = clone(baseArtifact());
    (artifact.nodes[1] as unknown as { id: unknown }).id = 42;
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("missing node id"))).toBe(true);
  });
});

describe("rule 9: sourceStatus enum (review hardening)", () => {
  it("rejects a sourceStatus outside the three-value enum", () => {
    const artifact = clone(baseArtifact());
    (artifact.nodes[1] as unknown as { sourceStatus: unknown }).sourceStatus = "maybe";
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("invalid sourceStatus"))).toBe(true);
  });

  it("rejects a missing sourceStatus", () => {
    const artifact = clone(baseArtifact());
    delete (artifact.nodes[1] as Partial<(typeof artifact.nodes)[1]>).sourceStatus;
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("invalid sourceStatus"))).toBe(true);
  });
});

describe("rule 10: SourceRef shape (export-boundary hardening)", () => {
  it.each([
    ["non-object ref", null, "expected an object"],
    ["missing quote", {}, "quote must be a non-empty string"],
    ["blank quote", { quote: "   " }, "quote must be a non-empty string"],
    ["invalid blockPath type", { quote: "valid", blockPath: "0" }, "blockPath"],
    ["negative blockPath entry", { quote: "valid", blockPath: [0, -1] }, "blockPath"],
    ["fractional blockPath entry", { quote: "valid", blockPath: [0.5] }, "blockPath"],
    ["negative charStart", { quote: "valid", charStart: -1 }, "charStart"],
    ["fractional charEnd", { quote: "valid", charEnd: 2.5 }, "charEnd"],
    ["reversed range", { quote: "valid", charStart: 8, charEnd: 2 }, "charEnd must be greater"],
  ])("rejects %s", (_label, ref, expectedError) => {
    const artifact = clone(baseArtifact()) as unknown as { nodes: Array<Record<string, unknown>> };
    artifact.nodes[1]!["sourceRefs"] = [ref];
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes(expectedError))).toBe(true);
  });

  it("rejects a non-array sourceRefs value even for missing evidence", () => {
    const artifact = clone(baseArtifact()) as unknown as { nodes: Array<Record<string, unknown>> };
    artifact.nodes[1]!["sourceStatus"] = "missing_evidence";
    artifact.nodes[1]!["sourceRefs"] = { quote: "not in an array" };
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("invalid sourceRefs"))).toBe(true);
  });

  it("accepts canonical optional paths and coherent character offsets", () => {
    const artifact = clone(baseArtifact());
    artifact.nodes[1]!.sourceRefs = [{ quote: "some risk text", blockPath: [0, 2], charStart: 4, charEnd: 18 }];
    expect(validateSemanticArtifact(artifact)).toEqual({ valid: true, errors: [] });
  });
});

describe("canonical scalar and relationship shapes (agent-boundary hardening)", () => {
  it.each([
    ["artifact title", (a: any) => { a.title = { token: "secret" }; }, "invalid artifact title"],
    ["node title", (a: any) => { a.nodes[1].title = { token: "secret" }; }, "invalid title on node"],
    ["action owner", (a: any) => { a.nodes[1] = { ...a.nodes[1], kind: "action", owner: { token: "secret" } }; }, "invalid owner"],
    ["relationship value", (a: any) => { a.nodes[1].relationships = { blocks: [{ token: "secret" }] }; }, "non-string id"],
  ])("rejects a noncanonical %s", (_label, mutate, expected) => {
    const artifact = clone(baseArtifact()) as any;
    mutate(artifact);
    const result = validateSemanticArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes(expected))).toBe(true);
  });
});
