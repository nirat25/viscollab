/** Hand-rolled AgentBrief validator. Never throws on untrusted input. */

import type { SemanticArtifact, SemanticNode } from "../semantic/types.js";
import type { AgentBriefValidationResult } from "./types.js";

const MAX_SUGGESTED_QUESTIONS = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unsupportedAssumptionIds(artifact: SemanticArtifact): Set<string> {
  const supportedIds = new Set(
    artifact.nodes
      .filter((node) => node.kind === "evidence")
      .flatMap((node) => node.relationships?.supports ?? [])
  );
  return new Set(
    artifact.nodes
      .filter(
        (node) =>
          node.kind === "assumption" &&
          (node.sourceStatus === "missing_evidence" || !supportedIds.has(node.id))
      )
      .map((node) => node.id)
  );
}

export function validateAgentBrief(
  value: unknown,
  artifact: SemanticArtifact
): AgentBriefValidationResult {
  if (!isRecord(value)) return { valid: false, errors: ["agent brief is not an object"] };
  const errors: string[] = [];
  const byId = new Map(artifact.nodes.map((node) => [node.id, node]));
  const unsupported = unsupportedAssumptionIds(artifact);

  if (value["schemaVersion"] !== 1) errors.push("invalid schemaVersion: expected 1");
  if (value["artifactId"] !== artifact.id) errors.push("artifactId does not match artifact");

  const checkIdList = (field: string, allowed: (node: SemanticNode) => boolean): void => {
    const raw = value[field];
    if (!Array.isArray(raw)) {
      errors.push(`${field} is not an array`);
      return;
    }
    const seen = new Set<string>();
    for (const entry of raw) {
      if (typeof entry !== "string" || entry.trim() === "") {
        errors.push(`${field} contains a non-string or empty id`);
        continue;
      }
      if (seen.has(entry)) errors.push(`duplicate id in ${field}: "${entry}"`);
      seen.add(entry);
      const node = byId.get(entry);
      if (!node) errors.push(`dangling id in ${field}: "${entry}"`);
      else if (!allowed(node)) errors.push(`wrong-kind id in ${field}: "${entry}" (${node.kind})`);
    }
  };

  checkIdList("decisionsNeeded", (node) => node.kind === "decision" && node.status !== "decided");
  checkIdList(
    "blockers",
    (node) =>
      (node.kind === "decision" && node.status === "blocked") ||
      (node.relationships?.blocks?.length ?? 0) > 0
  );
  checkIdList("unsupportedAssumptions", (node) => node.kind === "assumption" && unsupported.has(node.id));
  checkIdList("actionItems", (node) => node.kind === "action" && node.done !== true);

  const rawQuestions = value["suggestedQuestions"];
  if (!Array.isArray(rawQuestions)) {
    errors.push("suggestedQuestions is not an array");
  } else {
    if (rawQuestions.length > MAX_SUGGESTED_QUESTIONS) {
      errors.push(`suggestedQuestions exceeds maximum ${MAX_SUGGESTED_QUESTIONS}`);
    }
    const seen = new Set<string>();
    for (const [index, raw] of rawQuestions.entries()) {
      if (!isRecord(raw)) {
        errors.push(`suggestedQuestions[${index}] is not an object`);
        continue;
      }
      if (typeof raw["text"] !== "string" || raw["text"].trim() === "") {
        errors.push(`suggestedQuestions[${index}] has empty text`);
      }
      const ids = raw["semanticNodeIds"];
      if (!Array.isArray(ids) || ids.length === 0) {
        errors.push(`suggestedQuestions[${index}] is ungrounded`);
        continue;
      }
      const local = new Set<string>();
      for (const id of ids) {
        if (typeof id !== "string" || !byId.has(id)) {
          errors.push(`suggestedQuestions[${index}] has dangling id "${String(id)}"`);
        } else if (local.has(id)) {
          errors.push(`suggestedQuestions[${index}] has duplicate id "${id}"`);
        }
        if (typeof id === "string") local.add(id);
      }
      const key = `${String(raw["text"])}\u0000${[...local].join("\u0000")}`;
      if (seen.has(key)) errors.push(`duplicate suggested question at index ${index}`);
      seen.add(key);
    }
  }

  const rawTasks = value["followUpTasks"];
  if (!Array.isArray(rawTasks)) {
    errors.push("followUpTasks is not an array");
  } else {
    const seen = new Set<string>();
    for (const [index, raw] of rawTasks.entries()) {
      if (!isRecord(raw)) {
        errors.push(`followUpTasks[${index}] is not an object`);
        continue;
      }
      const id = raw["semanticNodeId"];
      const reason = raw["reason"];
      if (typeof id !== "string" || !byId.has(id)) {
        errors.push(`followUpTasks[${index}] has dangling id "${String(id)}"`);
        continue;
      }
      const node = byId.get(id)!;
      const validReason =
        (reason === "open_action" && node.kind === "action" && node.done !== true) ||
        (reason === "open_question" && node.kind === "question") ||
        (reason === "validate_assumption" && node.kind === "assumption" && unsupported.has(node.id));
      if (!validReason) errors.push(`invalid follow-up reason for "${id}": "${String(reason)}"`);
      const key = `${id}:${String(reason)}`;
      if (seen.has(key)) errors.push(`duplicate follow-up task: "${key}"`);
      seen.add(key);
    }
  }

  return { valid: errors.length === 0, errors };
}
