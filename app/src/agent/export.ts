/** Deterministic, safe export payload for a semantic decision room. */

import type { Comment } from "../collab/comments.js";
import { planVisuals } from "../visual/plan.js";
import { validateSemanticArtifact } from "../semantic/schema.js";
import type {
  SemanticArtifact,
  SemanticNode,
  SemanticRelationships,
  SourceRef,
} from "../semantic/types.js";
import { validateVisualPlan } from "../visual/validate.js";
import type { VisualBlock, VisualPlan } from "../visual/types.js";
import { generateAgentBrief } from "./brief.js";
import type { CommentsSummary, DecisionRoomExport, DecisionRoomExportInput, OpenCommentThread } from "./types.js";

function openThread(comment: Comment): OpenCommentThread {
  return {
    commentId: comment.id,
    author: comment.author,
    body: comment.body,
    createdAt: comment.createdAt,
    feedbackType: comment.feedbackType,
    anchorStatus: comment.anchorStatus,
    ...(comment.target.type === "semantic"
      ? {
          semanticNodeId: comment.target.semanticNodeId,
          ...(comment.target.visualBlockId ? { visualBlockId: comment.target.visualBlockId } : {}),
        }
      : {}),
    replies: comment.replies.map(({ id, author, body, ts }) => ({ id, author, body, ts })),
  };
}

function summarizeComments(comments: readonly Comment[]): CommentsSummary {
  const open = comments.filter((comment) => comment.lifecycle === "open");
  return {
    counts: {
      total: comments.length,
      open: open.length,
      resolved: comments.length - open.length,
      blockers: open.filter((comment) => comment.feedbackType === "flag").length,
      questions: open.filter((comment) => comment.feedbackType === "question").length,
    },
    openThreads: open.map(openThread),
  };
}

function sanitizeSourceRef(ref: SourceRef): SourceRef {
  return {
    quote: ref.quote,
    ...(ref.blockPath === undefined ? {} : { blockPath: [...ref.blockPath] }),
    ...(ref.charStart === undefined ? {} : { charStart: ref.charStart }),
    ...(ref.charEnd === undefined ? {} : { charEnd: ref.charEnd }),
  };
}

function sanitizeRelationships(
  relationships: SemanticRelationships | undefined
): SemanticRelationships | undefined {
  if (!relationships) return undefined;
  const sanitized: SemanticRelationships = {};
  const keys: Array<keyof SemanticRelationships> = [
    "supports",
    "contradicts",
    "dependsOn",
    "blocks",
    "ownedBy",
  ];
  for (const key of keys) {
    const ids = relationships[key];
    if (ids !== undefined) sanitized[key] = [...ids];
  }
  return Object.keys(sanitized).length === 0 ? undefined : sanitized;
}

function commonNodeFields(node: SemanticNode) {
  const relationships = sanitizeRelationships(node.relationships);
  return {
    id: node.id,
    ...(node.label === undefined ? {} : { label: node.label }),
    title: node.title,
    summary: node.summary,
    sourceRefs: node.sourceRefs.map(sanitizeSourceRef),
    sourceStatus: node.sourceStatus,
    ...(relationships === undefined ? {} : { relationships }),
  };
}

function sanitizeNode(node: SemanticNode): SemanticNode {
  const common = commonNodeFields(node);
  switch (node.kind) {
    case "decision":
      return {
        ...common,
        kind: "decision",
        question: node.question,
        ...(node.recommendedOptionId === undefined ? {} : { recommendedOptionId: node.recommendedOptionId }),
        ...(node.status === undefined ? {} : { status: node.status }),
      };
    case "risk":
      return {
        ...common,
        kind: "risk",
        ...(node.likelihood === undefined ? {} : { likelihood: node.likelihood }),
        ...(node.impact === undefined ? {} : { impact: node.impact }),
      };
    case "tradeoff":
      return { ...common, kind: "tradeoff", dimension: node.dimension };
    case "action":
      return {
        ...common,
        kind: "action",
        ...(node.owner === undefined ? {} : { owner: node.owner }),
        ...(node.due === undefined ? {} : { due: node.due }),
        ...(node.order === undefined ? {} : { order: node.order }),
        ...(node.done === undefined ? {} : { done: node.done }),
      };
    case "stakeholder":
      return {
        ...common,
        kind: "stakeholder",
        ...(node.role === undefined ? {} : { role: node.role }),
      };
    case "claim": return { ...common, kind: "claim" };
    case "evidence": return { ...common, kind: "evidence" };
    case "assumption": return { ...common, kind: "assumption" };
    case "option": return { ...common, kind: "option" };
    case "question": return { ...common, kind: "question" };
  }
}

function sanitizeArtifact(artifact: SemanticArtifact): SemanticArtifact {
  return {
    schemaVersion: 1,
    id: artifact.id,
    sourceFile: artifact.sourceFile,
    title: artifact.title,
    bluf: artifact.bluf,
    thesis: artifact.thesis,
    ...(artifact.primaryDecisionId === undefined
      ? {}
      : { primaryDecisionId: artifact.primaryDecisionId }),
    nodes: artifact.nodes.map(sanitizeNode),
    extractedBy: artifact.extractedBy,
  };
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Invalid visual plan ${field}`);
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`Invalid visual plan ${field}`);
  }
  return [...value];
}

function sanitizeVisualBlock(block: VisualBlock): VisualBlock {
  const base = {
    id: stringValue(block.id, "block.id"),
    kind: block.kind,
    title: stringValue(block.title, `${block.id}.title`),
    nodeIds: stringArray(block.nodeIds, `${block.id}.nodeIds`),
  };
  switch (block.kind) {
    case "decisionBrief":
      return {
        ...base,
        kind: "decisionBrief",
        ...(block.decisionId === undefined
          ? {}
          : { decisionId: stringValue(block.decisionId, `${block.id}.decisionId`) }),
        keyOptionIds: stringArray(block.keyOptionIds, `${block.id}.keyOptionIds`),
        keyRiskIds: stringArray(block.keyRiskIds, `${block.id}.keyRiskIds`),
        keyActionIds: stringArray(block.keyActionIds, `${block.id}.keyActionIds`),
      };
    case "mindMap":
      return {
        ...base,
        kind: "mindMap",
        rootId: stringValue(block.rootId, `${block.id}.rootId`),
        edges: block.edges.map((edge, index) => ({
          from: stringValue(edge.from, `${block.id}.edges[${index}].from`),
          to: stringValue(edge.to, `${block.id}.edges[${index}].to`),
          relation: stringValue(edge.relation, `${block.id}.edges[${index}].relation`),
        })),
      };
    case "argumentMap":
      return {
        ...base,
        kind: "argumentMap",
        claimIds: stringArray(block.claimIds, `${block.id}.claimIds`),
        edges: block.edges.map((edge, index) => {
          if (edge.relation !== "supports" && edge.relation !== "contradicts") {
            throw new Error(`Invalid visual plan ${block.id}.edges[${index}].relation`);
          }
          return {
            from: stringValue(edge.from, `${block.id}.edges[${index}].from`),
            to: stringValue(edge.to, `${block.id}.edges[${index}].to`),
            relation: edge.relation,
          };
        }),
      };
    case "tradeoffMatrix":
      return {
        ...base,
        kind: "tradeoffMatrix",
        optionIds: stringArray(block.optionIds, `${block.id}.optionIds`),
        dimensionIds: stringArray(block.dimensionIds, `${block.id}.dimensionIds`),
        cells: block.cells.map((cell, index) => {
          if (
            cell.sentiment !== undefined &&
            cell.sentiment !== "pos" &&
            cell.sentiment !== "neg" &&
            cell.sentiment !== "neutral"
          ) {
            throw new Error(`Invalid visual plan ${block.id}.cells[${index}].sentiment`);
          }
          return {
            optionId: stringValue(cell.optionId, `${block.id}.cells[${index}].optionId`),
            tradeoffId: stringValue(cell.tradeoffId, `${block.id}.cells[${index}].tradeoffId`),
            value: stringValue(cell.value, `${block.id}.cells[${index}].value`),
            ...(cell.sentiment === undefined ? {} : { sentiment: cell.sentiment }),
          };
        }),
      };
    case "riskMap":
      return {
        ...base,
        kind: "riskMap",
        riskIds: stringArray(block.riskIds, `${block.id}.riskIds`),
        assumptionIds: stringArray(block.assumptionIds, `${block.id}.assumptionIds`),
      };
    case "timeline":
      return { ...base, kind: "timeline", actionIds: stringArray(block.actionIds, `${block.id}.actionIds`) };
    case "actionChecklist":
      return { ...base, kind: "actionChecklist", actionIds: stringArray(block.actionIds, `${block.id}.actionIds`) };
    case "openQuestions":
      return { ...base, kind: "openQuestions", questionIds: stringArray(block.questionIds, `${block.id}.questionIds`) };
  }
}

function sanitizedPlanOrReplanned(value: unknown, artifact: SemanticArtifact): VisualPlan {
  if (value && typeof value === "object") {
    try {
      const candidate = value as VisualPlan;
      if (validateVisualPlan(candidate, artifact).valid) {
        const sanitized: VisualPlan = {
          schemaVersion: 1,
          artifactId: artifact.id,
          blocks: candidate.blocks.map(sanitizeVisualBlock),
        };
        if (validateVisualPlan(sanitized, artifact).valid) return sanitized;
      }
    } catch {
      // Stored plan is malformed: deterministic replanning below is the safe fallback.
    }
  }
  return planVisuals(artifact);
}

/**
 * Builds the Phase-8 export shape without copying persistence-only or raw document state.
 * `exportedAt` is supplied by the route so this function remains deterministic in tests.
 */
export function buildDecisionRoomExport(input: DecisionRoomExportInput): DecisionRoomExport {
  const validation = validateSemanticArtifact(input.artifact);
  if (!validation.valid) {
    throw new Error(`Invalid semantic artifact: ${validation.errors.join("; ")}`);
  }

  // Reconstruct the full artifact through a field allowlist. This prevents extra fields on
  // untrusted persisted JSON from crossing the export boundary even when TypeScript types claim
  // the value is already canonical.
  const artifact = sanitizeArtifact(input.artifact);
  const { comments, documentId, exportedAt } = input;
  return {
    schemaVersion: 1,
    exportedAt,
    documentId,
    artifactId: artifact.id,
    semanticArtifact: artifact,
    visualPlan: sanitizedPlanOrReplanned(input.visualPlan, artifact),
    agentBrief: generateAgentBrief(artifact),
    commentsSummary: summarizeComments(comments),
    openActions: artifact.nodes.filter(
      (node): node is import("../semantic/types.js").ActionNode =>
        node.kind === "action" && node.done !== true
    ),
  };
}
