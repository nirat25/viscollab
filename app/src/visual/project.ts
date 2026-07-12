/**
 * TipTap projection (docs/rebuild-architecture.md §7.1) — pure JSON, no
 * ProseMirror/TipTap imports. Lives in app (not web) so round-trip tests run
 * key-free in the app vitest suite (ARCH DECISION C4).
 *
 * ARCH DECISION — attrs hold IDS ONLY (`blockId`, `blockKind`, `primaryNodeId`).
 * React NodeViews look the full block/node data up from SemanticArtifactContext
 * by id. This keeps the ProseMirror doc tiny, makes serialization losslessly
 * round-trippable, and prevents projection drift.
 *
 * `VISUAL_TIPTAP_NODE_NAMES` is the single source of custom node names —
 * web/src/components/tiptap/nodes.ts imports it, so app and web cannot diverge.
 */

import type { SemanticArtifact } from "../semantic/types.js";
import type { VisualBlock, VisualBlockKind, VisualPlan } from "./types.js";

/** VisualBlock kind → TipTap custom node name (brief §7.1 name map).
 *  `openQuestions` has NO TipTap node — it renders inline in the Brief/Actions
 *  region (ARCH DECISION: keeps the custom node count at the 8 the plan named). */
export const VISUAL_TIPTAP_NODE_NAMES = {
  decisionBrief: "decisionBriefBlock",
  mindMap: "mindMapBlock",
  argumentMap: "argumentMapBlock",
  tradeoffMatrix: "tradeoffMatrixBlock",
  riskMap: "riskMapBlock",
  timeline: "timelineBlock",
  actionChecklist: "actionChecklistBlock",
  sourceExcerpt: "sourceExcerptBlock",
} as const;

export type VisualTipTapNodeName =
  (typeof VISUAL_TIPTAP_NODE_NAMES)[keyof typeof VISUAL_TIPTAP_NODE_NAMES];

export interface TipTapVisualBlockNode {
  type: VisualTipTapNodeName;
  attrs: {
    blockId: string;
    blockKind: VisualBlockKind | "sourceExcerpt";
    /** The block's anchor node (decision id, mind-map root, …) or null. */
    primaryNodeId: string | null;
  };
}

export interface TipTapVisualDoc {
  type: "doc";
  content: TipTapVisualBlockNode[];
}

/** The one block kind projected without a plan entry: the Source tab's excerpt
 *  view. One node per artifact in v1, anchored on the primary decision. */
export const SOURCE_EXCERPT_BLOCK_ID = "vb_sourceExcerpt";

function primaryNodeIdFor(block: VisualBlock): string | null {
  switch (block.kind) {
    case "decisionBrief":  return block.decisionId ?? null;
    case "mindMap":        return block.rootId;
    case "argumentMap":    return block.claimIds[0] ?? null;
    case "tradeoffMatrix": return block.optionIds[0] ?? null;
    case "riskMap":        return block.riskIds[0] ?? null;
    case "timeline":       return block.actionIds[0] ?? null;
    case "actionChecklist": return block.actionIds[0] ?? null;
    case "openQuestions":  return block.questionIds[0] ?? null;
  }
}

/**
 * Project artifact + plan into the decision-room TipTap document (plain JSON).
 * Deterministic; one custom node per plan block in plan order (openQuestions
 * skipped — rendered inline), plus one trailing sourceExcerptBlock.
 */
export function projectArtifact(
  artifact: SemanticArtifact,
  plan: VisualPlan
): TipTapVisualDoc {
  const content: TipTapVisualBlockNode[] = [];

  for (const block of plan.blocks) {
    if (block.kind === "openQuestions") continue; // inline in Brief/Actions, no node
    content.push({
      type: VISUAL_TIPTAP_NODE_NAMES[block.kind],
      attrs: {
        blockId: block.id,
        blockKind: block.kind,
        primaryNodeId: primaryNodeIdFor(block),
      },
    });
  }

  content.push({
    type: VISUAL_TIPTAP_NODE_NAMES.sourceExcerpt,
    attrs: {
      blockId: SOURCE_EXCERPT_BLOCK_ID,
      blockKind: "sourceExcerpt",
      primaryNodeId: artifact.primaryDecisionId ?? null,
    },
  });

  return { type: "doc", content };
}
