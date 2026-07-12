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

export type {
  RawExtraction,
  RawExtractionNode,
  SemanticPipelineOpts,
  SemanticPipelineResult,
} from "./extract.js";
export {
  EXTRACT_PROMPT_VERSION,
  ExtractionError,
  artifactIdFor,
  buildExtractionPrompt,
  extractSemantic,
  parseRawExtraction,
  rawToArtifact,
  runSemanticPipeline,
} from "./extract.js";

export { clearMockFixtures, heuristicExtract, mockExtract, registerMockFixture } from "./mock.js";

export type { SemanticCriterion, SemanticCriterionId, SemanticJudgeVerdict } from "./rubric.js";
export {
  SEMANTIC_CRITERIA,
  SEMANTIC_RUBRIC_VERSION,
  SEMANTIC_THRESHOLDS,
  buildSemanticJudgePrompt,
} from "./rubric.js";
