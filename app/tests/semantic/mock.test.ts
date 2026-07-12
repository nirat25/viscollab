/**
 * Deterministic tests for mock extraction (SEM-007) and the rubric shape (SEM-008).
 * Offline: no network, no keys.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { TipTapDoc } from "../../src/ir.js";
import type { SemanticArtifact } from "../../src/semantic/types.js";
import {
  clearMockFixtures,
  heuristicExtract,
  mockExtract,
  registerMockFixture,
} from "../../src/semantic/mock.js";
import { runSemanticPipeline } from "../../src/semantic/extract.js";
import { validateSemanticArtifact } from "../../src/semantic/schema.js";
import { validateSourceTrace } from "../../src/semantic/sourceTrace.js";
import {
  SEMANTIC_CRITERIA,
  SEMANTIC_THRESHOLDS,
  buildSemanticJudgePrompt,
} from "../../src/semantic/rubric.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "semantic");
const founderIr = JSON.parse(readFileSync(join(FIXTURES, "founder-memo.ir.json"), "utf8")) as TipTapDoc;
const founderGolden = JSON.parse(
  readFileSync(join(FIXTURES, "founder-memo.artifact.json"), "utf8")
) as SemanticArtifact;

beforeEach(() => clearMockFixtures());

describe("mockExtract — fixture map", () => {
  it("returns the registered golden for a known sourceFile", () => {
    registerMockFixture(founderIr.sourceFile, founderGolden);
    expect(mockExtract(founderIr)).toEqual(founderGolden);
  });

  it("matches by basename when registered with a path", () => {
    registerMockFixture(`/some/dir/${founderIr.sourceFile}`, founderGolden);
    expect(mockExtract(founderIr)).toEqual(founderGolden);
  });
});

describe("mockExtract — heuristic fallback", () => {
  it("produces a schema-valid artifact from the founder memo without a registered golden", () => {
    const a = mockExtract(founderIr);
    expect(a.extractedBy).toBe("mock");
    expect(validateSemanticArtifact(a).valid).toBe(true);
    // Quotes are verbatim from the IR, so every quote is findable in the source.
    expect(validateSourceTrace(a, founderIr).valid).toBe(true);
    expect(a.primaryDecisionId).toBe("decision_1");
  });

  it("is deterministic", () => {
    expect(mockExtract(founderIr)).toEqual(mockExtract(founderIr));
  });

  it("never throws and stays valid on a degenerate empty doc", () => {
    const empty: TipTapDoc = { type: "doc", sourceFile: "empty.md", content: [] };
    const a = mockExtract(empty);
    expect(validateSemanticArtifact(a).valid).toBe(true);
    expect(a.nodes.length).toBeGreaterThanOrEqual(1);
  });

  it("handles a weird doc (only a table/image, no headings) with a valid artifact", () => {
    const weird: TipTapDoc = {
      type: "doc",
      sourceFile: "weird.md",
      content: [
        {
          type: "paragraph",
          attrs: {},
          content: [{ type: "text", text: "Should we do this?" }],
        } as TipTapDoc["content"][number],
      ],
    };
    const a = mockExtract(weird);
    expect(validateSemanticArtifact(a).valid).toBe(true);
    // The trailing "?" paragraph becomes an open question.
    expect(a.nodes.some((n) => n.kind === "question")).toBe(true);
  });

  it("heuristicExtract picks up actions under a 'Next steps' heading", () => {
    const doc: TipTapDoc = {
      type: "doc",
      sourceFile: "actions.md",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Plan" }] },
        { type: "paragraph", attrs: {}, content: [{ type: "text", text: "We will act." }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Next steps" }] },
        {
          type: "bulletList",
          attrs: {},
          content: [
            {
              type: "listItem",
              attrs: {},
              content: [
                { type: "paragraph", attrs: {}, content: [{ type: "text", text: "Ship the fix" }] },
              ],
            },
          ],
        },
      ] as TipTapDoc["content"],
    };
    const a = heuristicExtract(doc);
    expect(a.nodes.some((n) => n.kind === "action" && n.title === "Ship the fix")).toBe(true);
  });
});

describe("runSemanticPipeline with injected extractor", () => {
  it("uses the injected mock extractor (no network)", async () => {
    registerMockFixture(founderIr.sourceFile, founderGolden);
    const { semanticArtifact } = await runSemanticPipeline(founderIr, { extractor: mockExtract });
    expect(semanticArtifact).toEqual(founderGolden);
  });
});

describe("semantic rubric (SEM-008) — structure only, judging is an eval", () => {
  it("defines exactly the six plan dimensions", () => {
    expect(SEMANTIC_CRITERIA.map((c) => c.id)).toEqual([
      "a_main_decision_identified",
      "b_no_invented_facts",
      "c_material_risks_captured",
      "d_assumptions_separated_from_evidence",
      "e_options_tradeoffs_captured",
      "f_actions_preserved",
    ]);
  });

  it("marks no-invented-facts as the zero-tolerance criterion", () => {
    const zt = SEMANTIC_CRITERIA.filter((c) => c.zeroTolerance).map((c) => c.id);
    expect(zt).toEqual(["b_no_invented_facts"]);
    expect(SEMANTIC_THRESHOLDS.zeroToleranceCriteria).toEqual(["b_no_invented_facts"]);
    // graded + zero-tolerance partition the full criteria set
    expect(
      [...SEMANTIC_THRESHOLDS.gradedCriteria, ...SEMANTIC_THRESHOLDS.zeroToleranceCriteria].sort()
    ).toEqual(SEMANTIC_CRITERIA.map((c) => c.id).sort());
  });

  it("builds a deterministic judge prompt embedding criteria, source, and artifact", () => {
    const p1 = buildSemanticJudgePrompt("SOURCE TEXT", founderGolden);
    const p2 = buildSemanticJudgePrompt("SOURCE TEXT", founderGolden);
    expect(p1).toBe(p2);
    expect(p1).toContain("b_no_invented_facts");
    expect(p1).toContain("SOURCE TEXT");
    expect(p1).toContain(founderGolden.title);
    expect(p1).toContain("criterionId");
  });
});
