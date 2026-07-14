/**
 * Public visual-planning API (barrel export, `./visual`).
 */

export type {
  VisualBlockKind,
  VisualBlockBase,
  DecisionBriefBlock,
  GraphEdge,
  MindMapBlock,
  ArgumentMapBlock,
  TradeoffCell,
  TradeoffMatrixBlock,
  RiskMapBlock,
  TimelineBlock,
  ActionChecklistBlock,
  OpenQuestionsBlock,
  VisualBlock,
  VisualPlan,
} from "./types.js";

export { BLOCK_TITLES, planVisuals } from "./plan.js";

export type { VisualPlanResult } from "./validate.js";
export { validateVisualPlan } from "./validate.js";

export type {
  ProjectArtifactOptions,
  TipTapVisualBlockNode,
  TipTapVisualDoc,
  VisualTipTapNodeName,
} from "./project.js";
export {
  SOURCE_EXCERPT_BLOCK_ID,
  VISUAL_TIPTAP_NODE_NAMES,
  projectArtifact,
} from "./project.js";
