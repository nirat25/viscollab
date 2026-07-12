/**
 * Hand-rolled runtime validator for SemanticArtifact (SEM-002).
 *
 * Matches the repo's existing validator style (validateContract() in
 * convert/template.ts, validateDisclosure() in render/): a pure function that
 * accepts the value to check and returns `{ valid: boolean; errors: string[] }`.
 * NO zod — see docs/rebuild-architecture.md §0 ground rule 5.
 *
 * Implements exactly the 7 rules in docs/rebuild-architecture.md §5.3. Each rule
 * produces a distinct, greppable error string so tests can assert on substrings.
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
    }

    // Rule 4: kind outside the 10-kind union.
    if (typeof kind !== "string" || !VALID_KINDS.has(kind as SemanticNodeKind)) {
      errors.push(`invalid kind on node "${id ?? "<unknown>"}": ${JSON.stringify(kind)}`);
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
    }

    // Rule 2: empty sourceRefs without sourceStatus "missing_evidence".
    const sourceRefs = node["sourceRefs"];
    const sourceStatus = node["sourceStatus"];
    const hasRefs = Array.isArray(sourceRefs) && sourceRefs.length > 0;
    if (!hasRefs && sourceStatus !== "missing_evidence") {
      errors.push(
        `empty sourceRefs on node "${id ?? "<unknown>"}" without sourceStatus "missing_evidence"`
      );
    }
  }

  // Second pass: dangling relationship ids (Rule 3) — needs the full knownIds set first.
  for (const node of nodes) {
    const id = typeof node["id"] === "string" ? (node["id"] as string) : "<unknown>";
    const relationships = node["relationships"];
    if (!isRecord(relationships)) continue;
    for (const key of RELATIONSHIP_KEYS) {
      const refs = relationships[key];
      if (!Array.isArray(refs)) continue;
      for (const refId of refs) {
        if (typeof refId === "string" && !knownIds.has(refId)) {
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
