/** Eval-only grounded Ask rubric. Run with real models; never use for exact-prose unit tests. */

import type { GroundedAgentAnswer } from "./types.js";
import type { SemanticArtifact } from "../semantic/types.js";

export const AGENT_RUBRIC_VERSION = "agent-groundedness-v1";

export type AgentCriterionId =
  | "a_citation_completeness"
  | "b_citation_entailment"
  | "c_no_unsupported_facts_or_numbers"
  | "d_missing_evidence_acknowledgement"
  | "e_preset_usefulness";

export interface AgentCriterion {
  id: AgentCriterionId;
  title: string;
  zeroTolerance: boolean;
  question: string;
}

export const AGENT_CRITERIA: AgentCriterion[] = [
  { id: "a_citation_completeness", title: "Citation completeness", zeroTolerance: false, question: "Does every material factual claim in the answer have one or more relevant canonical citations?" },
  { id: "b_citation_entailment", title: "Citation entailment", zeroTolerance: true, question: "Do the cited canonical quotes actually support the corresponding claims, without citation laundering or misleading scope?" },
  { id: "c_no_unsupported_facts_or_numbers", title: "No unsupported facts or numbers", zeroTolerance: true, question: "Does the answer avoid every fact, number, date, causal claim, or recommendation not supported by the semantic artifact and citations?" },
  { id: "d_missing_evidence_acknowledgement", title: "Missing-evidence acknowledgement", zeroTolerance: true, question: "When the room lacks adequate evidence, does the answer use the standard insufficient-evidence response rather than speculate?" },
  { id: "e_preset_usefulness", title: "Preset usefulness", zeroTolerance: false, question: "Does the answer appropriately emphasize the selected perspective while preserving the same facts and grounding requirements?" },
];

export const AGENT_THRESHOLDS = {
  gradedPassRate: 0.8,
  gradedCriteria: ["a_citation_completeness", "e_preset_usefulness"] as AgentCriterionId[],
  zeroToleranceCriteria: ["b_citation_entailment", "c_no_unsupported_facts_or_numbers", "d_missing_evidence_acknowledgement"] as AgentCriterionId[],
};

export interface AgentJudgeVerdict {
  criterionId: AgentCriterionId;
  pass: boolean;
  reasoning: string;
}

export function buildAgentJudgePrompt(
  question: string,
  artifact: SemanticArtifact,
  answer: GroundedAgentAnswer
): string {
  const criteria = AGENT_CRITERIA.map((criterion) =>
    `- id: ${criterion.id}${criterion.zeroTolerance ? " (ZERO TOLERANCE)" : ""}\n  question: ${criterion.question}`
  ).join("\n");
  return `You are judging grounded decision-room Ask quality (${AGENT_RUBRIC_VERSION}).\n\nJudge the answer strictly from the QUESTION, SEMANTIC ARTIFACT, and CANONICAL MATERIALIZED ANSWER below.\n\nCRITERIA:\n${criteria}\n\nReturn ONLY a JSON array, one entry per criterion, exactly:\n[{"criterionId":"<id>","pass":true|false,"reasoning":"<1-3 sentences>"}]\n\nQUESTION:\n---\n${question}\n---\n\nSEMANTIC ARTIFACT:\n---\n${JSON.stringify(artifact, null, 2)}\n---\n\nCANONICAL MATERIALIZED ANSWER:\n---\n${JSON.stringify(answer, null, 2)}\n---\n\nReturn the JSON array now.`;
}
