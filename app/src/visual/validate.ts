/**
 * Visual plan validator (VIS-003).
 *
 * Every id a block carries — nodeIds plus each kind-specific id field
 * (rootId, claimIds, optionIds, dimensionIds, cell ids, edge endpoints, …) —
 * must reference an existing artifact node. Hand-rolled (no zod), matching
 * schema.ts conventions: `{ valid, errors[] }` with distinct error strings.
 */

import type { SemanticArtifact } from "../semantic/types.js";
import type { VisualBlock, VisualBlockKind, VisualPlan } from "./types.js";

export interface VisualPlanResult {
  valid: boolean;
  errors: string[];
}

const VALID_KINDS: VisualBlockKind[] = [
  "decisionBrief",
  "mindMap",
  "argumentMap",
  "tradeoffMatrix",
  "riskMap",
  "timeline",
  "actionChecklist",
  "openQuestions",
];

export function validateVisualPlan(
  plan: VisualPlan,
  artifact: SemanticArtifact
): VisualPlanResult {
  const errors: string[] = [];

  if (!plan || typeof plan !== "object" || !Array.isArray(plan.blocks)) {
    return { valid: false, errors: ["visual plan is not an object with a blocks array"] };
  }
  if (plan.schemaVersion !== 1) {
    errors.push(`invalid schemaVersion: expected 1, got ${JSON.stringify(plan.schemaVersion)}`);
  }
  if (plan.artifactId !== artifact.id) {
    errors.push(`artifactId mismatch: plan "${plan.artifactId}" vs artifact "${artifact.id}"`);
  }

  const known = new Set(artifact.nodes.map((n) => n.id));
  const seenBlockIds = new Set<string>();

  const checkId = (blockId: string, field: string, id: string) => {
    if (!known.has(id)) {
      errors.push(`unknown node id in ${blockId}.${field}: "${id}"`);
    }
  };

  for (const block of plan.blocks as VisualBlock[]) {
    if (seenBlockIds.has(block.id)) {
      errors.push(`duplicate block id: "${block.id}"`);
    }
    seenBlockIds.add(block.id);

    if (!VALID_KINDS.includes(block.kind)) {
      errors.push(`invalid block kind: "${block.kind as string}" (${block.id})`);
      continue;
    }
    if (!block.title || block.title.trim() === "") {
      errors.push(`empty block title: ${block.id}`);
    }

    for (const id of block.nodeIds) checkId(block.id, "nodeIds", id);

    switch (block.kind) {
      case "decisionBrief":
        if (block.decisionId) checkId(block.id, "decisionId", block.decisionId);
        block.keyOptionIds.forEach((id) => checkId(block.id, "keyOptionIds", id));
        block.keyRiskIds.forEach((id) => checkId(block.id, "keyRiskIds", id));
        block.keyActionIds.forEach((id) => checkId(block.id, "keyActionIds", id));
        break;
      case "mindMap":
        checkId(block.id, "rootId", block.rootId);
        block.edges.forEach((e, i) => {
          checkId(block.id, `edges[${i}].from`, e.from);
          checkId(block.id, `edges[${i}].to`, e.to);
        });
        break;
      case "argumentMap":
        block.claimIds.forEach((id) => checkId(block.id, "claimIds", id));
        block.edges.forEach((e, i) => {
          checkId(block.id, `edges[${i}].from`, e.from);
          checkId(block.id, `edges[${i}].to`, e.to);
        });
        break;
      case "tradeoffMatrix":
        block.optionIds.forEach((id) => checkId(block.id, "optionIds", id));
        block.dimensionIds.forEach((id) => checkId(block.id, "dimensionIds", id));
        block.cells.forEach((c, i) => {
          checkId(block.id, `cells[${i}].optionId`, c.optionId);
          checkId(block.id, `cells[${i}].tradeoffId`, c.tradeoffId);
        });
        break;
      case "riskMap":
        block.riskIds.forEach((id) => checkId(block.id, "riskIds", id));
        block.assumptionIds.forEach((id) => checkId(block.id, "assumptionIds", id));
        break;
      case "timeline":
        block.actionIds.forEach((id) => checkId(block.id, "actionIds", id));
        break;
      case "actionChecklist":
        block.actionIds.forEach((id) => checkId(block.id, "actionIds", id));
        break;
      case "openQuestions":
        block.questionIds.forEach((id) => checkId(block.id, "questionIds", id));
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}
