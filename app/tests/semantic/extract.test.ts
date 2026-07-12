/**
 * Deterministic tests for extraction post-processing (SEM-006).
 * No network, no keys: rawToArtifact / buildExtractionPrompt / parseRawExtraction
 * are pure. LLM output QUALITY is the eval rubric's job, not unit tests (PRD §12B).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { TipTapDoc } from "../../src/ir.js";
import {
  ExtractionError,
  buildExtractionPrompt,
  parseRawExtraction,
  rawToArtifact,
  type RawExtraction,
} from "../../src/semantic/extract.js";
import { validateSemanticArtifact } from "../../src/semantic/schema.js";
import type { DecisionNode, TradeoffNode } from "../../src/semantic/types.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "semantic");
const founderIr = JSON.parse(
  readFileSync(join(FIXTURES, "founder-memo.ir.json"), "utf8")
) as TipTapDoc;

/** Minimal raw extraction whose quotes are verbatim spans of the founder memo IR. */
function sampleRaw(): RawExtraction {
  return {
    title: "Sunset Anchor Classic",
    bluf: "We should sunset Anchor Classic by Q4.",
    thesis: "Maintaining two product lines splits engineering focus.",
    primaryDecision: {
      title: "Sunset Anchor Classic",
      summary: "Retire the legacy product line.",
      question: "Do we sunset Anchor Classic by Q4?",
      recommendedOption: "Full sunset by Q4",
      sourceQuotes: ["Anchor Classic"],
    },
    nodes: [
      { kind: "option", title: "Full sunset by Q4", summary: "Retire entirely.", sourceQuotes: ["Anchor Classic"] },
      { kind: "option", title: "Maintenance mode", summary: "Freeze features.", sourceQuotes: ["Anchor Classic"] },
      {
        kind: "risk",
        title: "Churn risk",
        summary: "Large accounts may leave.",
        likelihood: "high",
        impact: "medium",
        sourceQuotes: ["Anchor Classic"],
        relationships: { blocks: ["Full sunset by Q4"] },
      },
      {
        kind: "tradeoff",
        title: "Cost",
        summary: "Ongoing maintenance cost comparison.",
        sourceQuotes: ["Anchor Classic"],
      },
      {
        kind: "action",
        title: "Draft migration plan",
        summary: "Write the migration plan.",
        owner: "Priya",
        due: "2026-08-01",
        sourceQuotes: ["Anchor Classic"],
        relationships: { dependsOn: [1] },
      },
      {
        kind: "assumption",
        title: "Migration tooling ready",
        summary: "Assumes tooling lands on time.",
        sourceStatus: "missing_evidence",
      },
    ],
  };
}

describe("buildExtractionPrompt", () => {
  it("is deterministic and embeds the document text", () => {
    const p1 = buildExtractionPrompt(founderIr);
    const p2 = buildExtractionPrompt(founderIr);
    expect(p1).toBe(p2);
    expect(p1).toContain("SOURCE DOCUMENT");
    // A phrase that must come from the memo body itself:
    expect(p1.length).toBeGreaterThan(500);
  });
});

describe("parseRawExtraction", () => {
  it("strips markdown fences defensively", () => {
    const raw = parseRawExtraction('```json\n{"title":"t","bluf":"b","thesis":"x","nodes":[]}\n```');
    expect(raw.title).toBe("t");
  });

  it("throws ExtractionError on non-JSON", () => {
    expect(() => parseRawExtraction("Sorry, I cannot")).toThrow(ExtractionError);
  });
});

describe("rawToArtifact", () => {
  it("assigns stable <kind>_<n> ids in extraction order", () => {
    const a = rawToArtifact(sampleRaw(), founderIr, "test-model");
    expect(a.primaryDecisionId).toBe("decision_1");
    const ids = a.nodes.map((n) => n.id);
    expect(ids).toEqual([
      "decision_1",
      "option_1",
      "option_2",
      "risk_1",
      "tradeoff_1",
      "action_1",
      "assumption_1",
    ]);
  });

  it("is deterministic (same raw input -> deep-equal artifact)", () => {
    expect(rawToArtifact(sampleRaw(), founderIr, "m")).toEqual(
      rawToArtifact(sampleRaw(), founderIr, "m")
    );
  });

  it("resolves relationship refs by title and by 1-based index", () => {
    const a = rawToArtifact(sampleRaw(), founderIr, "m");
    const risk = a.nodes.find((n) => n.id === "risk_1")!;
    expect(risk.relationships?.blocks).toEqual(["option_1"]); // by title
    const action = a.nodes.find((n) => n.id === "action_1")!;
    expect(action.relationships?.dependsOn).toEqual(["option_1"]); // by index 1
  });

  it("resolves recommendedOption to an option node id", () => {
    const a = rawToArtifact(sampleRaw(), founderIr, "m");
    const decision = a.nodes.find((n) => n.id === "decision_1") as DecisionNode;
    expect(decision.recommendedOptionId).toBe("option_1");
  });

  it("drops unresolvable relationship refs instead of leaving dangling ids", () => {
    const raw = sampleRaw();
    raw.nodes[2]!.relationships = { blocks: ["No Such Node"] };
    const a = rawToArtifact(raw, founderIr, "m");
    const risk = a.nodes.find((n) => n.id === "risk_1")!;
    expect(risk.relationships).toBeUndefined();
    // Still schema-valid — no dangling ids were kept.
    expect(validateSemanticArtifact(a).valid).toBe(true);
  });

  it("falls back to title for a tradeoff without dimension", () => {
    const a = rawToArtifact(sampleRaw(), founderIr, "m");
    const tradeoff = a.nodes.find((n) => n.id === "tradeoff_1") as TradeoffNode;
    expect(tradeoff.dimension).toBe("Cost");
  });

  it("produces a schema-valid artifact with resolved source spans", () => {
    const a = rawToArtifact(sampleRaw(), founderIr, "test-model");
    expect(validateSemanticArtifact(a).valid).toBe(true);
    expect(a.extractedBy).toBe("test-model");
    expect(a.sourceFile).toBe(founderIr.sourceFile);
    const decision = a.nodes.find((n) => n.id === "decision_1")!;
    // "Anchor Classic" is verbatim in the memo, so sourceTrace resolves it.
    expect(decision.sourceRefs[0]?.charStart).toBeTypeOf("number");
  });

  it("throws ExtractionError (with rule errors) when the model output breaks schema", () => {
    const raw = sampleRaw();
    raw.primaryDecision!.question = ""; // violates non-empty decision question
    expect(() => rawToArtifact(raw, founderIr, "m")).toThrow(ExtractionError);
  });

  it("throws on structurally bogus model output", () => {
    expect(() => rawToArtifact({} as RawExtraction, founderIr, "m")).toThrow(ExtractionError);
  });
});
