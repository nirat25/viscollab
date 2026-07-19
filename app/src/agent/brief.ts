/** Pure, deterministic generation and validation of AgentBrief. */

import type {
  AssumptionNode,
  SemanticArtifact,
  SemanticNodeId,
} from "../semantic/types.js";
import type {
  AgentBrief,
  AgentFollowUpTask,
  SuggestedReviewerQuestion,
} from "./types.js";

const MAX_SUGGESTED_QUESTIONS = 8;

function uniqueStable(ids: readonly SemanticNodeId[]): SemanticNodeId[] {
  return [...new Set(ids)];
}

function unsupportedAssumptions(artifact: SemanticArtifact): AssumptionNode[] {
  const supportedIds = new Set(
    artifact.nodes
      .filter((node) => node.kind === "evidence")
      .flatMap((node) => node.relationships?.supports ?? [])
  );
  return artifact.nodes.filter(
    (node): node is AssumptionNode =>
      node.kind === "assumption" &&
      (node.sourceStatus === "missing_evidence" || !supportedIds.has(node.id))
  );
}

function addQuestion(
  output: SuggestedReviewerQuestion[],
  seen: Set<string>,
  text: string,
  semanticNodeIds: SemanticNodeId[]
): void {
  const clean = text.trim();
  const ids = uniqueStable(semanticNodeIds);
  if (!clean || ids.length === 0) return;
  const key = `${clean}\u0000${ids.join("\u0000")}`;
  if (seen.has(key) || output.length >= MAX_SUGGESTED_QUESTIONS) return;
  seen.add(key);
  output.push({ text: clean, semanticNodeIds: ids });
}

export function generateAgentBrief(artifact: SemanticArtifact): AgentBrief {
  const decisionsNeeded = artifact.nodes
    .filter((node) => node.kind === "decision" && node.status !== "decided")
    .map((node) => node.id);
  const blockers = uniqueStable(
    artifact.nodes
      .filter(
        (node) =>
          (node.kind === "decision" && node.status === "blocked") ||
          (node.relationships?.blocks?.length ?? 0) > 0
      )
      .map((node) => node.id)
  );
  const unsupported = unsupportedAssumptions(artifact);
  const actionItems = artifact.nodes
    .filter((node) => node.kind === "action" && node.done !== true)
    .map((node) => node.id);

  const suggestedQuestions: SuggestedReviewerQuestion[] = [];
  const seenQuestions = new Set<string>();

  for (const node of artifact.nodes) {
    if (node.kind === "question") {
      addQuestion(suggestedQuestions, seenQuestions, node.summary || node.title, [node.id]);
    }
  }
  for (const node of artifact.nodes) {
    if (node.kind === "decision" && node.status !== "decided") {
      addQuestion(suggestedQuestions, seenQuestions, node.question, [node.id]);
    }
  }
  const blockerSet = new Set(blockers);
  for (const node of artifact.nodes) {
    if (blockerSet.has(node.id)) {
      addQuestion(
        suggestedQuestions,
        seenQuestions,
        `What must be resolved to unblock “${node.title}”?`,
        [node.id, ...(node.relationships?.blocks ?? [])]
      );
    }
  }
  for (const node of unsupported) {
    addQuestion(
      suggestedQuestions,
      seenQuestions,
      `What evidence would validate the assumption “${node.title}”?`,
      [node.id]
    );
  }
  for (const node of artifact.nodes) {
    if (node.kind === "risk") {
      addQuestion(
        suggestedQuestions,
        seenQuestions,
        `How should we mitigate the risk “${node.title}”?`,
        [node.id]
      );
    }
  }

  const followUpTasks: AgentFollowUpTask[] = [];
  for (const node of artifact.nodes) {
    if (node.kind === "action" && node.done !== true) {
      followUpTasks.push({ semanticNodeId: node.id, reason: "open_action" });
    } else if (node.kind === "question") {
      followUpTasks.push({ semanticNodeId: node.id, reason: "open_question" });
    } else if (node.kind === "assumption" && unsupported.some((item) => item.id === node.id)) {
      followUpTasks.push({ semanticNodeId: node.id, reason: "validate_assumption" });
    }
  }

  return {
    schemaVersion: 1,
    artifactId: artifact.id,
    decisionsNeeded,
    blockers,
    unsupportedAssumptions: unsupported.map((node) => node.id),
    actionItems,
    suggestedQuestions,
    followUpTasks,
  };
}
