/**
 * Hand-rolled runtime validator for SemanticArtifact (SEM-002).
 *
 * Matches the repo's existing validator style (validateContract() in
 * convert/template.ts, validateDisclosure() in render/): a pure function that
 * accepts the value to check and returns `{ valid: boolean; errors: string[] }`.
 * NO zod — see docs/rebuild-architecture.md §0 ground rule 5.
 *
 * Implements the 7 rules in docs/rebuild-architecture.md §5.3, plus two
 * hardenings from review: rule 8 (missing/non-string node id), rule 9
 * (sourceStatus enum), and rule 10 (SourceRef shape). Each rule produces a distinct, greppable
 * error string so tests can assert on substrings.
 */

import type { SemanticNodeKind } from "./types.js";

export interface SchemaResult {
  valid: boolean;
  errors: string[];
}

const VALID_KINDS: ReadonlySet<SemanticNodeKind> = new Set<SemanticNodeKind>([
  "decision", "claim", "evidence", "assumption", "risk",
  "option", "tradeoff", "action", "question", "stakeholder",
]);

const RELATIONSHIP_KEYS = ["supports", "contradicts", "dependsOn", "blocks", "ownedBy"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function validateSourceRef(ref: unknown, nodeId: string, index: number, errors: string[]): void {
  const prefix = `invalid sourceRef on node "${nodeId}" at index ${index}`;
  if (!isRecord(ref)) {
    errors.push(`${prefix}: expected an object`);
    return;
  }

  if (typeof ref["quote"] !== "string" || ref["quote"].trim() === "") {
    errors.push(`${prefix}: quote must be a non-empty string`);
  }

  const blockPath = ref["blockPath"];
  if (
    blockPath !== undefined &&
    (!Array.isArray(blockPath) || blockPath.some((part) => !isNonnegativeInteger(part)))
  ) {
    errors.push(`${prefix}: blockPath must be an array of nonnegative integers`);
  }

  const charStart = ref["charStart"];
  const charEnd = ref["charEnd"];
  if (charStart !== undefined && !isNonnegativeInteger(charStart)) {
    errors.push(`${prefix}: charStart must be a nonnegative integer`);
  }
  if (charEnd !== undefined && !isNonnegativeInteger(charEnd)) {
    errors.push(`${prefix}: charEnd must be a nonnegative integer`);
  }
  if (
    isNonnegativeInteger(charStart) &&
    isNonnegativeInteger(charEnd) &&
    charEnd < charStart
  ) {
    errors.push(`${prefix}: charEnd must be greater than or equal to charStart`);
  }
}

/**
 * Validate a (possibly untrusted / malformed) value as a SemanticArtifact.
 * Accepts `unknown` and checks shape defensively before asserting field values —
 * never throws on garbage input, always returns a result object.
 */
export function validateSemanticArtifact(artifact: unknown): SchemaResult {
  const errors: string[] = [];

  if (!isRecord(artifact)) {
    return { valid: false, errors: ["semantic artifact is not an object"] };
  }

  // Rule 7: schemaVersion !== 1
  if (artifact["schemaVersion"] !== 1) {
    errors.push(
      `invalid schemaVersion: expected 1, got ${JSON.stringify(artifact["schemaVersion"])}`
    );
  }

  for (const field of ["id", "sourceFile", "title", "bluf", "thesis", "extractedBy"] as const) {
    if (typeof artifact[field] !== "string") {
      errors.push(`invalid artifact ${field}: expected a string`);
    }
  }

  const rawNodes = artifact["nodes"];
  if (!Array.isArray(rawNodes)) {
    errors.push("nodes is not an array");
    return { valid: false, errors };
  }

  const nodes = rawNodes.filter(isRecord);
  if (nodes.length !== rawNodes.length) {
    errors.push("nodes contains a non-object entry");
  }

  const knownIds = new Set<string>();
  const seenIds = new Set<string>();
  const decisionIds = new Set<string>();

  // First pass: ids, kinds, sourceRefs, decision summaries.
  for (const node of nodes) {
    const id = typeof node["id"] === "string" ? (node["id"] as string) : undefined;
    const kind = node["kind"];

    // Rule 1: duplicate node ids.
    if (id) {
      if (seenIds.has(id)) {
        errors.push(`duplicate node id: "${id}"`);
      }
      seenIds.add(id);
      knownIds.add(id);
    } else {
      // Rule 8: a node without a (string) id would silently escape rules 1/3
      // and break Phase 4/7 anchoring — reject it outright.
      errors.push(
        `missing node id: node kind ${JSON.stringify(kind)} has no string "id"`
      );
    }

    // Rule 4: kind outside the 10-kind union.
    if (typeof kind !== "string" || !VALID_KINDS.has(kind as SemanticNodeKind)) {
      errors.push(`invalid kind on node "${id ?? "<unknown>"}": ${JSON.stringify(kind)}`);
    }

    for (const field of ["title", "summary"] as const) {
      if (typeof node[field] !== "string") {
        errors.push(`invalid ${field} on node "${id ?? "<unknown>"}": expected a string`);
      }
    }
    if (node["label"] !== undefined && typeof node["label"] !== "string") {
      errors.push(`invalid label on node "${id ?? "<unknown>"}": expected a string`);
    }

    if (kind === "decision") {
      if (id) decisionIds.add(id);
      // Rule 6: decision node with empty question or empty summary.
      const question = node["question"];
      const summary = node["summary"];
      const hasQuestion = typeof question === "string" && question.trim() !== "";
      const hasSummary = typeof summary === "string" && summary.trim() !== "";
      if (!hasQuestion || !hasSummary) {
        errors.push(
          `missing decision summary: node "${id ?? "<unknown>"}" must have a non-empty question and summary`
        );
      }
      if (
        node["status"] !== undefined &&
        node["status"] !== "proposed" &&
        node["status"] !== "under_review" &&
        node["status"] !== "decided" &&
        node["status"] !== "blocked"
      ) {
        errors.push(`invalid decision status on node "${id ?? "<unknown>"}"`);
      }
      if (
        node["recommendedOptionId"] !== undefined &&
        typeof node["recommendedOptionId"] !== "string"
      ) {
        errors.push(`invalid recommendedOptionId on node "${id ?? "<unknown>"}"`);
      }
    } else if (kind === "risk") {
      for (const field of ["likelihood", "impact"] as const) {
        const value = node[field];
        if (value !== undefined && value !== "low" && value !== "medium" && value !== "high") {
          errors.push(`invalid ${field} on node "${id ?? "<unknown>"}"`);
        }
      }
    } else if (kind === "tradeoff") {
      if (typeof node["dimension"] !== "string") {
        errors.push(`invalid dimension on node "${id ?? "<unknown>"}": expected a string`);
      }
    } else if (kind === "action") {
      for (const field of ["owner", "due"] as const) {
        if (node[field] !== undefined && typeof node[field] !== "string") {
          errors.push(`invalid ${field} on node "${id ?? "<unknown>"}": expected a string`);
        }
      }
      if (node["order"] !== undefined && typeof node["order"] !== "number") {
        errors.push(`invalid order on node "${id ?? "<unknown>"}": expected a number`);
      }
      if (node["done"] !== undefined && typeof node["done"] !== "boolean") {
        errors.push(`invalid done on node "${id ?? "<unknown>"}": expected a boolean`);
      }
    } else if (kind === "stakeholder") {
      if (node["role"] !== undefined && typeof node["role"] !== "string") {
        errors.push(`invalid role on node "${id ?? "<unknown>"}": expected a string`);
      }
    }

    // Rule 2: empty sourceRefs without sourceStatus "missing_evidence".
    const sourceRefs = node["sourceRefs"];
    const sourceStatus = node["sourceStatus"];
    const hasRefs = Array.isArray(sourceRefs) && sourceRefs.length > 0;
    if (!Array.isArray(sourceRefs)) {
      errors.push(`invalid sourceRefs on node "${id ?? "<unknown>"}": expected an array`);
    } else {
      sourceRefs.forEach((ref, index) =>
        validateSourceRef(ref, id ?? "<unknown>", index, errors)
      );
    }
    if (!hasRefs && sourceStatus !== "missing_evidence") {
      errors.push(
        `empty sourceRefs on node "${id ?? "<unknown>"}" without sourceStatus "missing_evidence"`
      );
    }

    // Rule 9: sourceStatus must be one of the three-value enum — Phase 5
    // renders grounding badges off this field.
    if (
      sourceStatus !== "explicit" &&
      sourceStatus !== "inferred" &&
      sourceStatus !== "missing_evidence"
    ) {
      errors.push(
        `invalid sourceStatus on node "${id ?? "<unknown>"}": ${JSON.stringify(sourceStatus)}`
      );
    }
  }

  // Second pass: dangling relationship ids (Rule 3) — needs the full knownIds set first.
  for (const node of nodes) {
    const id = typeof node["id"] === "string" ? (node["id"] as string) : "<unknown>";
    const relationships = node["relationships"];
    if (relationships === undefined) continue;
    if (!isRecord(relationships) || Array.isArray(relationships)) {
      errors.push(`invalid relationships on node "${id}": expected an object`);
      continue;
    }
    for (const key of RELATIONSHIP_KEYS) {
      const refs = relationships[key];
      if (refs === undefined) continue;
      if (!Array.isArray(refs)) {
        errors.push(`invalid relationship refs: node "${id}" ${key} must be an array`);
        continue;
      }
      for (const refId of refs) {
        if (typeof refId !== "string") {
          errors.push(`invalid relationship ref: node "${id}" ${key} contains a non-string id`);
        } else if (!knownIds.has(refId)) {
          errors.push(`dangling relationship id: node "${id}" ${key} references unknown id "${refId}"`);
        }
      }
    }
  }

  // Rule 5: primaryDecisionId set but no matching decision node.
  const primaryDecisionId = artifact["primaryDecisionId"];
  if (primaryDecisionId !== undefined) {
    if (typeof primaryDecisionId !== "string" || !decisionIds.has(primaryDecisionId)) {
      errors.push(`primaryDecisionId "${String(primaryDecisionId)}" does not match a decision node`);
    }
  }

  return { valid: errors.length === 0, errors };
}
