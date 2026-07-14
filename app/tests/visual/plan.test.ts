/**
 * Deterministic tests for the visual planner (VIS-002), validator (VIS-003),
 * and TipTap projection (docs/rebuild-architecture.md §4, §7.1).
 * Offline: no network, no keys.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SemanticArtifact, ActionNode } from "../../src/semantic/types.js";
import { BLOCK_TITLES, planVisuals } from "../../src/visual/plan.js";
import { validateVisualPlan } from "../../src/visual/validate.js";
import {
  SOURCE_EXCERPT_BLOCK_ID,
  VISUAL_TIPTAP_NODE_NAMES,
  projectArtifact,
} from "../../src/visual/project.js";
import type { TimelineBlock, TradeoffMatrixBlock, VisualPlan } from "../../src/visual/types.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "semantic");
const founder = JSON.parse(
  readFileSync(join(FIXTURES, "founder-memo.artifact.json"), "utf8")
) as SemanticArtifact;
const dental = JSON.parse(
  readFileSync(join(FIXTURES, "dentaltechhub.artifact.json"), "utf8")
) as SemanticArtifact;

const kindsOf = (plan: VisualPlan) => plan.blocks.map((b) => b.kind);

describe("planVisuals — founder memo golden (rich artifact)", () => {
  const plan = planVisuals(founder);

  it("emits blocks in canonical order with vb_<kind> ids and fixed titles", () => {
    const kinds = kindsOf(plan);
    // Canonical order is preserved for whatever subset is emitted.
    const canonical = [
      "decisionBrief", "mindMap", "argumentMap", "tradeoffMatrix",
      "riskMap", "timeline", "actionChecklist", "openQuestions",
    ];
    expect([...kinds].sort((a, b) => canonical.indexOf(a) - canonical.indexOf(b))).toEqual(kinds);
    for (const b of plan.blocks) {
      expect(b.id).toBe(`vb_${b.kind}`);
      expect(b.title).toBe(BLOCK_TITLES[b.kind]);
    }
  });

  it("emits the rich blocks the golden supports", () => {
    const kinds = kindsOf(plan);
    expect(kinds).toContain("decisionBrief");
    expect(kinds).toContain("tradeoffMatrix"); // 10-kind golden: ≥2 options + ≥1 dimension
    expect(kinds).toContain("riskMap");
    expect(kinds).toContain("actionChecklist");
    expect(kinds).toContain("openQuestions");
  });

  it("fills tradeoff cells only from stated relationships — never fabricates", () => {
    const matrix = plan.blocks.find((b) => b.kind === "tradeoffMatrix") as TradeoffMatrixBlock;
    expect(matrix.cells.length).toBe(matrix.optionIds.length * matrix.dimensionIds.length);
    for (const cell of matrix.cells) {
      if (cell.value === "—") continue;
      const dim = founder.nodes.find((n) => n.id === cell.tradeoffId)!;
      expect(cell.value).toBe(dim.summary); // surfaced text exists in the artifact
    }
  });

  it("every planned block passes validation", () => {
    const res = validateVisualPlan(plan, founder);
    expect(res.errors).toEqual([]);
    expect(res.valid).toBe(true);
  });

  it("is deterministic", () => {
    expect(planVisuals(founder)).toEqual(plan);
  });
});

describe("planVisuals — dentaltechhub golden (sparse artifact omits weak blocks)", () => {
  const plan = planVisuals(dental);

  it("omits blocks whose thresholds fail instead of padding", () => {
    const kinds = kindsOf(plan);
    const optionCount = dental.nodes.filter((n) => n.kind === "option").length;
    const tradeoffCount = dental.nodes.filter((n) => n.kind === "tradeoff").length;
    if (optionCount < 2 || tradeoffCount < 1) expect(kinds).not.toContain("tradeoffMatrix");
    expect(kinds).toContain("decisionBrief");
  });

  it("passes validation", () => {
    expect(validateVisualPlan(plan, dental).valid).toBe(true);
  });
});

describe("planVisuals — degenerate and threshold edges", () => {
  it("never throws on an empty artifact and returns no blocks (or brief from thesis)", () => {
    const empty: SemanticArtifact = {
      schemaVersion: 1, id: "sa_x", sourceFile: "x.md", title: "", bluf: "",
      thesis: "", nodes: [], extractedBy: "mock",
    };
    const plan = planVisuals(empty);
    expect(plan.blocks).toEqual([]);
    expect(validateVisualPlan(plan, empty).valid).toBe(true);
  });

  it("emits a thesis-only decisionBrief when there is no decision node", () => {
    const artifact: SemanticArtifact = {
      schemaVersion: 1, id: "sa_y", sourceFile: "y.md", title: "T", bluf: "B",
      thesis: "A central argument.", nodes: [], extractedBy: "mock",
    };
    const plan = planVisuals(artifact);
    expect(kindsOf(plan)).toEqual(["decisionBrief"]);
    expect(plan.blocks[0]!.nodeIds).toEqual([]);
  });

  it("orders the timeline by order, then due, ties stable", () => {
    const mkAction = (id: string, opts: Partial<ActionNode>): ActionNode => ({
      id, kind: "action", title: id, summary: id,
      sourceRefs: [], sourceStatus: "missing_evidence", ...opts,
    });
    const artifact: SemanticArtifact = {
      schemaVersion: 1, id: "sa_t", sourceFile: "t.md", title: "T", bluf: "B",
      thesis: "x",
      nodes: [
        mkAction("action_1", { due: "2026-09-01" }),
        mkAction("action_2", { order: 1 }),
        mkAction("action_3", { due: "2026-08-01" }),
        mkAction("action_4", { due: "2026-08-01" }), // tie with action_3 → stays after
      ],
      extractedBy: "mock",
    };
    const plan = planVisuals(artifact);
    const timeline = plan.blocks.find((b) => b.kind === "timeline") as TimelineBlock;
    expect(timeline.actionIds).toEqual(["action_2", "action_3", "action_4", "action_1"]);
  });
});

describe("validateVisualPlan — rejects broken plans", () => {
  const goodPlan = planVisuals(founder);

  it("catches an unknown nodeId", () => {
    const bad: VisualPlan = JSON.parse(JSON.stringify(goodPlan));
    bad.blocks[0]!.nodeIds.push("risk_999");
    const res = validateVisualPlan(bad, founder);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("risk_999"))).toBe(true);
  });

  it("catches a dangling edge endpoint in graph blocks", () => {
    const bad: VisualPlan = JSON.parse(JSON.stringify(goodPlan));
    const mm = bad.blocks.find((b) => b.kind === "mindMap");
    if (mm && mm.kind === "mindMap") {
      mm.edges.push({ from: "claim_1", to: "ghost_1", relation: "supports" });
      const res = validateVisualPlan(bad, founder);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("ghost_1"))).toBe(true);
    }
  });

  it("catches duplicate block ids and artifactId mismatch", () => {
    const bad: VisualPlan = JSON.parse(JSON.stringify(goodPlan));
    bad.blocks.push(JSON.parse(JSON.stringify(bad.blocks[0]!)));
    bad.artifactId = "sa_other";
    const res = validateVisualPlan(bad, founder);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("duplicate block id"))).toBe(true);
    expect(res.errors.some((e) => e.includes("artifactId mismatch"))).toBe(true);
  });
});

describe("projectArtifact — TipTap projection (§7.1)", () => {
  const plan = planVisuals(founder);
  const doc = projectArtifact(founder, plan);

  it("is valid PM-shaped JSON: one node per non-openQuestions block + source excerpt", () => {
    expect(doc.type).toBe("doc");
    const planned = plan.blocks.filter((b) => b.kind !== "openQuestions");
    expect(doc.content.length).toBe(planned.length + 1); // + sourceExcerptBlock
    const names = Object.values(VISUAL_TIPTAP_NODE_NAMES);
    for (const node of doc.content) {
      expect(names).toContain(node.type);
      expect(typeof node.attrs.blockId).toBe("string");
      expect(Object.keys(node.attrs).sort()).toEqual(["blockId", "blockKind", "primaryNodeId"]);
    }
    expect(doc.content.at(-1)!.attrs.blockId).toBe(SOURCE_EXCERPT_BLOCK_ID);
  });

  it("attrs are ids-only and JSON round-trips losslessly", () => {
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
    for (const node of doc.content) {
      expect(node.attrs.primaryNodeId === null || typeof node.attrs.primaryNodeId === "string").toBe(true);
    }
  });

  it("preserves plan order", () => {
    const planned = plan.blocks.filter((b) => b.kind !== "openQuestions").map((b) => b.id);
    expect(doc.content.slice(0, -1).map((n) => n.attrs.blockId)).toEqual(planned);
  });

  it("omits the trailing sourceExcerptBlock when includeSourceExcerpt is false (Phase 6 tabs)", () => {
    const noExcerpt = projectArtifact(founder, plan, { includeSourceExcerpt: false });
    const planned = plan.blocks.filter((b) => b.kind !== "openQuestions").map((b) => b.id);
    expect(noExcerpt.content.map((n) => n.attrs.blockId)).toEqual(planned);
    expect(noExcerpt.content.some((n) => n.attrs.blockKind === "sourceExcerpt")).toBe(false);
  });
});

describe("cellValue checks both relationship directions (review SF#3)", () => {
  it("fills a cell when the OPTION carries the relationship to the dimension", () => {
    const artifact: SemanticArtifact = {
      schemaVersion: 1, id: "sa_cv", sourceFile: "cv.md", title: "T", bluf: "B", thesis: "x",
      nodes: [
        { id: "option_1", kind: "option", title: "A", summary: "A", sourceRefs: [],
          sourceStatus: "missing_evidence", relationships: { dependsOn: ["tradeoff_1"] } },
        { id: "option_2", kind: "option", title: "B", summary: "B", sourceRefs: [],
          sourceStatus: "missing_evidence" },
        { id: "tradeoff_1", kind: "tradeoff", dimension: "cost", title: "Cost",
          summary: "A is cheaper.", sourceRefs: [], sourceStatus: "missing_evidence" },
      ],
      extractedBy: "mock",
    };
    const plan = planVisuals(artifact);
    const matrix = plan.blocks.find((b) => b.kind === "tradeoffMatrix") as TradeoffMatrixBlock;
    const cell1 = matrix.cells.find((c) => c.optionId === "option_1")!;
    const cell2 = matrix.cells.find((c) => c.optionId === "option_2")!;
    expect(cell1.value).toBe("A is cheaper.");
    expect(cell2.value).toBe("—");
  });
});
