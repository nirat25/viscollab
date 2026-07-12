/**
 * Visual plan types (VIS-001).
 *
 * Copied VERBATIM from docs/rebuild-architecture.md §3.2 (BINDING type sketches).
 * Pure types, zero runtime code.
 */

import type { SemanticNodeId } from "../semantic/types.js";

export type VisualBlockKind =
  | "decisionBrief" | "mindMap" | "argumentMap" | "tradeoffMatrix"
  | "riskMap" | "timeline" | "actionChecklist" | "openQuestions";

export interface VisualBlockBase {
  id: string;                 // stable, e.g. "vb_tradeoffMatrix" (one per kind in v1)
  kind: VisualBlockKind;
  title: string;
  /** EVERY semantic node id this block renders. Drives validate.ts + Phase-7 block anchoring. */
  nodeIds: SemanticNodeId[];
}

export interface DecisionBriefBlock extends VisualBlockBase {
  kind: "decisionBrief";
  decisionId?: SemanticNodeId; keyOptionIds: SemanticNodeId[];
  keyRiskIds: SemanticNodeId[]; keyActionIds: SemanticNodeId[];
}
export interface GraphEdge { from: SemanticNodeId; to: SemanticNodeId; relation: string; }
export interface MindMapBlock   extends VisualBlockBase { kind: "mindMap";   rootId: SemanticNodeId; edges: GraphEdge[]; }
export interface ArgumentMapBlock extends VisualBlockBase {
  kind: "argumentMap";
  claimIds: SemanticNodeId[];
  edges: Array<{ from: SemanticNodeId; to: SemanticNodeId; relation: "supports" | "contradicts" }>;
}
export interface TradeoffCell { optionId: SemanticNodeId; tradeoffId: SemanticNodeId; value: string; sentiment?: "pos" | "neg" | "neutral"; }
export interface TradeoffMatrixBlock extends VisualBlockBase {
  kind: "tradeoffMatrix";
  optionIds: SemanticNodeId[]; dimensionIds: SemanticNodeId[]; cells: TradeoffCell[];
}
export interface RiskMapBlock extends VisualBlockBase {
  kind: "riskMap";
  riskIds: SemanticNodeId[]; assumptionIds: SemanticNodeId[];
}
export interface TimelineBlock       extends VisualBlockBase { kind: "timeline";       actionIds: SemanticNodeId[]; }  // pre-ordered
export interface ActionChecklistBlock extends VisualBlockBase { kind: "actionChecklist"; actionIds: SemanticNodeId[]; }
export interface OpenQuestionsBlock   extends VisualBlockBase { kind: "openQuestions";  questionIds: SemanticNodeId[]; }

export type VisualBlock =
  | DecisionBriefBlock | MindMapBlock | ArgumentMapBlock | TradeoffMatrixBlock
  | RiskMapBlock | TimelineBlock | ActionChecklistBlock | OpenQuestionsBlock;

export interface VisualPlan {
  schemaVersion: 1;
  artifactId: string;
  blocks: VisualBlock[];      // canonical order, weak blocks omitted (§4)
}
