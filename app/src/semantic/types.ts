/**
 * Semantic model types (SEM-001).
 *
 * Copied VERBATIM from docs/rebuild-architecture.md §3.1 (BINDING type sketches).
 * Pure types, zero runtime code. Do not add runtime logic to this file.
 */

/** Opaque, STABLE node id. Format `${kindPrefix}_${n}` (e.g. "risk_2"), assigned in
 *  deterministic extraction order. Treat as opaque for identity/anchoring; do not parse.
 *  Stability matters: Phase 7 comment anchors key on this id. */
export type SemanticNodeId = string;

export type SemanticNodeKind =
  | "decision" | "claim" | "evidence" | "assumption" | "risk"
  | "option"   | "tradeoff" | "action" | "question" | "stakeholder";

export type SourceStatus = "explicit" | "inferred" | "missing_evidence";

/** A grounding pointer from a semantic node back into the source IR.
 *  `quote` is VERBATIM source text (enables no-fabrication checks + highlight).
 *  `charStart/charEnd` are into `nodeToPlainText(ir)` and are FILLED BY sourceTrace,
 *  not by the LLM. `blockPath` is an optional index path into TipTapDoc.content. */
export interface SourceRef {
  quote: string;
  blockPath?: number[];
  charStart?: number;
  charEnd?: number;
}

/** Directed relationships. Values are SemanticNodeIds (ownedBy → a stakeholder id). */
export interface SemanticRelationships {
  supports?: SemanticNodeId[];
  contradicts?: SemanticNodeId[];
  dependsOn?: SemanticNodeId[];
  blocks?: SemanticNodeId[];
  ownedBy?: SemanticNodeId[];
}

export interface SemanticNodeBase {
  id: SemanticNodeId;
  kind: SemanticNodeKind;
  /** Short human label for display/anchoring, e.g. "R2", "Option B". NOT the id. */
  label?: string;
  title: string;
  summary: string;
  sourceRefs: SourceRef[];
  sourceStatus: SourceStatus;
  relationships?: SemanticRelationships;
}

export interface DecisionNode extends SemanticNodeBase {
  kind: "decision";
  /** The one-line ask a reviewer must respond to. Required & non-empty (validator-enforced). */
  question: string;
  /** Recommended option id, if the memo states one. */
  recommendedOptionId?: SemanticNodeId;
  status?: "proposed" | "under_review" | "decided" | "blocked";
}
export interface ClaimNode      extends SemanticNodeBase { kind: "claim"; }
export interface EvidenceNode   extends SemanticNodeBase { kind: "evidence"; /** claim(s) it backs */ }
export interface AssumptionNode extends SemanticNodeBase { kind: "assumption"; }
export interface RiskNode extends SemanticNodeBase {
  kind: "risk";
  likelihood?: "low" | "medium" | "high";
  impact?: "low" | "medium" | "high";
}
export interface OptionNode   extends SemanticNodeBase { kind: "option"; }
export interface TradeoffNode extends SemanticNodeBase {
  kind: "tradeoff";
  /** A comparison DIMENSION (e.g. "cost", "time-to-ship"). Used as a matrix column. */
  dimension: string;
}
export interface ActionNode extends SemanticNodeBase {
  kind: "action";
  owner?: string;             // free text or resolved stakeholder label
  due?: string;               // ISO date or relative phrase ("This quarter")
  order?: number;             // planner sequence hint for timeline
  done?: boolean;
}
export interface QuestionNode    extends SemanticNodeBase { kind: "question"; }
export interface StakeholderNode extends SemanticNodeBase { kind: "stakeholder"; role?: string; }

export type SemanticNode =
  | DecisionNode | ClaimNode | EvidenceNode | AssumptionNode | RiskNode
  | OptionNode | TradeoffNode | ActionNode | QuestionNode | StakeholderNode;

export interface SemanticArtifact {
  schemaVersion: 1;
  /** Stable id for the artifact; comment anchors are {artifactId, versionId, semanticNodeId,...}. */
  id: string;
  sourceFile: string;
  title: string;               // generated room title
  /** BLUF: one-sentence bottom-line-up-front for the top bar. */
  bluf: string;
  thesis: string;              // the memo's central argument, plain
  primaryDecisionId?: SemanticNodeId; // the decision the brief anchors on
  nodes: SemanticNode[];       // flat list; relationships express the graph
  extractedBy: "mock" | string; // model id or "mock"
}

/*
 * Kind-prefix map for ids (deterministic): `decision→decision`, `claim→claim`,
 * `evidence→evidence`, `assumption→assumption`, `risk→risk`, `option→option`,
 * `tradeoff→tradeoff`, `action→action`, `question→question`, `stakeholder→stakeholder`,
 * then `_<n>` 1-based within kind, in extraction order.
 */
