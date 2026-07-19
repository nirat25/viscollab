/** Framework-free contracts for the Phase-8 agent-ready layer. */

import type {
  ActionNode,
  SemanticArtifact,
  SemanticNodeId,
  SemanticNodeKind,
} from "../semantic/types.js";
import type { VisualPlan } from "../visual/types.js";
import type { Comment, Reply } from "../collab/comments.js";

export type AgentPreset = "founder" | "cfo" | "cto" | "pm" | "investor";

export interface AgentFollowUpTask {
  semanticNodeId: SemanticNodeId;
  reason: "open_action" | "open_question" | "validate_assumption";
}

export interface SuggestedReviewerQuestion {
  text: string;
  semanticNodeIds: SemanticNodeId[];
}

export interface AgentBrief {
  schemaVersion: 1;
  artifactId: string;
  decisionsNeeded: SemanticNodeId[];
  blockers: SemanticNodeId[];
  unsupportedAssumptions: SemanticNodeId[];
  actionItems: SemanticNodeId[];
  suggestedQuestions: SuggestedReviewerQuestion[];
  followUpTasks: AgentFollowUpTask[];
}

export interface RawAgentCitation {
  semanticNodeId: SemanticNodeId;
  sourceRefIndex: number;
}

export interface RawAgentAnswer {
  answer: string;
  citations: RawAgentCitation[];
  insufficientEvidence?: boolean;
}

export interface GroundedCitation extends RawAgentCitation {
  nodeKind: SemanticNodeKind;
  nodeTitle: string;
  quote: string;
  charStart?: number;
  charEnd?: number;
}

export interface GroundedAgentAnswer {
  schemaVersion: 1;
  artifactId: string;
  preset: AgentPreset;
  answer: string;
  citations: GroundedCitation[];
  insufficientEvidence: boolean;
  model: string;
  simulated: boolean;
}

export const AGENT_PRESETS = ["founder", "cfo", "cto", "pm", "investor"] as const;

export const AGENT_PRESET_LABELS: Readonly<Record<AgentPreset, string>> = {
  founder: "Founder",
  cfo: "CFO",
  cto: "CTO",
  pm: "PM",
  investor: "Investor",
};

/** A preset changes emphasis only. It never changes facts or grounding rules. */
export const AGENT_PRESET_LENS_GUIDANCE: Readonly<Record<AgentPreset, string>> = {
  founder: "Emphasize the core decision, strategic coherence, blockers, and speed to alignment.",
  cfo: "Emphasize economics, resource allocation, downside exposure, and measurable tradeoffs.",
  cto: "Emphasize technical feasibility, dependencies, operational risk, and delivery sequencing.",
  pm: "Emphasize user impact, scope, prioritization, dependencies, and executable next steps.",
  investor: "Emphasize strategic upside, defensibility, material risk, evidence quality, and milestones.",
};

export interface AgentBriefValidationResult {
  valid: boolean;
  errors: string[];
}

export interface RawAgentAnswerValidationResult {
  valid: boolean;
  errors: string[];
}

export interface AskPrompt {
  system: string;
  user: string;
}

export interface ExportReply extends Pick<Reply, "id" | "author" | "body" | "ts"> {}

export interface OpenCommentThread {
  commentId: string;
  author: string;
  body: string;
  createdAt: number;
  feedbackType: Comment["feedbackType"];
  anchorStatus: Comment["anchorStatus"];
  semanticNodeId?: SemanticNodeId;
  visualBlockId?: string;
  replies: ExportReply[];
}

export interface CommentsSummary {
  counts: {
    total: number;
    open: number;
    resolved: number;
    blockers: number;
    questions: number;
  };
  openThreads: OpenCommentThread[];
}

export interface DecisionRoomExport {
  schemaVersion: 1;
  exportedAt: string;
  documentId: string;
  artifactId: string;
  semanticArtifact: SemanticArtifact;
  visualPlan: VisualPlan;
  agentBrief: AgentBrief;
  commentsSummary: CommentsSummary;
  openActions: ActionNode[];
}

export interface DecisionRoomExportInput {
  exportedAt: string;
  documentId: string;
  artifact: SemanticArtifact;
  visualPlan?: unknown;
  comments: readonly Comment[];
}
