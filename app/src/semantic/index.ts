/**
 * Public semantic-model API (barrel export, `./semantic`).
 *
 * Consumers import from here; internal module structure is an implementation detail.
 */

export type {
  SemanticNodeId,
  SemanticNodeKind,
  SourceStatus,
  SourceRef,
  SemanticRelationships,
  SemanticNodeBase,
  DecisionNode,
  ClaimNode,
  EvidenceNode,
  AssumptionNode,
  RiskNode,
  OptionNode,
  TradeoffNode,
  ActionNode,
  QuestionNode,
  StakeholderNode,
  SemanticNode,
  SemanticArtifact,
  AgentBrief,
} from "./types.js";

export type { SchemaResult } from "./schema.js";
export { validateSemanticArtifact } from "./schema.js";

export type { SourceTraceResult } from "./sourceTrace.js";
export { resolveSourceRefs, validateSourceTrace } from "./sourceTrace.js";
