/**
 * Semantic extraction eval rubric (SEM-008) — EVAL ONLY.
 *
 * Applied by an LLM judge to a (source document, extracted SemanticArtifact)
 * pair. Run on demand with real keys — NEVER part of the CI unit run, and
 * never an exact-string unit assertion (PRD §12B). Mirrors convert/rubric.ts.
 *
 * The six dimensions come from docs/visual-decision-room-plan.md Phase 2 /
 * docs/rebuild-architecture.md §5.5.
 */

import type { SemanticArtifact } from "./types.js";

export const SEMANTIC_RUBRIC_VERSION = "sem-rubric-v1";

export type SemanticCriterionId =
  | "a_main_decision_identified"
  | "b_no_invented_facts"
  | "c_material_risks_captured"
  | "d_assumptions_separated_from_evidence"
  | "e_options_tradeoffs_captured"
  | "f_actions_preserved";

export interface SemanticCriterion {
  id: SemanticCriterionId;
  title: string;
  /** Zero-tolerance criteria must pass 100% (no-fabrication is absolute). */
  zeroTolerance: boolean;
  /** The exact question the judge is asked to decide. */
  question: string;
}

export const SEMANTIC_CRITERIA: SemanticCriterion[] = [
  {
    id: "a_main_decision_identified",
    title: "Main decision identified",
    zeroTolerance: false,
    question:
      "Does the artifact's primaryDecision capture the decision this document actually asks its " +
      "readers to make — the one a reviewer must answer — rather than a side issue or a " +
      "restatement of the topic?",
  },
  {
    id: "b_no_invented_facts",
    title: "No invented facts",
    zeroTolerance: true,
    question:
      "Confirm every node's title/summary is grounded in the source: no fabricated decisions, " +
      "risks, options, actions, numbers, names, or dates that the document does not contain. " +
      "Check the sourceQuotes are genuine verbatim spans, not paraphrases presented as quotes.",
  },
  {
    id: "c_material_risks_captured",
    title: "Material risks captured",
    zeroTolerance: false,
    question:
      "Are the material risks the document raises (explicitly or clearly implied) present as " +
      "risk nodes? A failure is a consequential risk in the source that the artifact omits.",
  },
  {
    id: "d_assumptions_separated_from_evidence",
    title: "Assumptions separated from evidence",
    zeroTolerance: false,
    question:
      "Are unverified premises captured as assumption nodes and factual support as evidence " +
      "nodes — not conflated? An assumption presented as evidence (or vice versa) is a failure.",
  },
  {
    id: "e_options_tradeoffs_captured",
    title: "Options and tradeoffs captured",
    zeroTolerance: false,
    question:
      "If the document weighs alternatives, are they present as option nodes with the comparison " +
      "dimensions as tradeoff nodes? (If the document genuinely considers no alternatives, " +
      "absence is correct — do not penalize.)",
  },
  {
    id: "f_actions_preserved",
    title: "Actions preserved",
    zeroTolerance: false,
    question:
      "Are the document's concrete next steps present as action nodes, with owners and dates " +
      "kept when the document states them?",
  },
];

/** Phase-gate thresholds for the semantic extraction eval. */
export const SEMANTIC_THRESHOLDS = {
  /** Graded criteria must pass on ≥80% of the golden set. */
  gradedPassRate: 0.8,
  gradedCriteria: [
    "a_main_decision_identified",
    "c_material_risks_captured",
    "d_assumptions_separated_from_evidence",
    "e_options_tradeoffs_captured",
    "f_actions_preserved",
  ] as SemanticCriterionId[],
  /** Zero-tolerance criteria must pass 100%. */
  zeroToleranceCriteria: ["b_no_invented_facts"] as SemanticCriterionId[],
};

export interface SemanticJudgeVerdict {
  criterionId: SemanticCriterionId;
  pass: boolean;
  reasoning: string;
}

/**
 * Build the judge prompt for one (source, artifact) pair.
 * Deterministic — unit tests assert structure/determinism only, never verdicts.
 */
export function buildSemanticJudgePrompt(
  sourceText: string,
  artifact: SemanticArtifact
): string {
  const criteriaBlock = SEMANTIC_CRITERIA.map(
    (c) => `- id: ${c.id}${c.zeroTolerance ? " (ZERO TOLERANCE)" : ""}\n  question: ${c.question}`
  ).join("\n");

  return `You are judging the quality of a semantic decision-model extraction (${SEMANTIC_RUBRIC_VERSION}).

Decide each criterion strictly from the SOURCE DOCUMENT and the EXTRACTED ARTIFACT below.

CRITERIA:
${criteriaBlock}

Return ONLY a JSON array, one entry per criterion, exactly:
[{"criterionId": "<id>", "pass": true|false, "reasoning": "<1-3 sentences>"}]

SOURCE DOCUMENT:
---
${sourceText}
---

EXTRACTED ARTIFACT (JSON):
---
${JSON.stringify(artifact, null, 2)}
---

Return the JSON array now.`;
}
