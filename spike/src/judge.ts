import type { DocIR } from "./ir.ts";
import { irToPlainText } from "./ir.ts";
import { CRITERIA, RUBRIC_VERSION, type CriterionId } from "./rubric.ts";
import { complete } from "./client.ts";

export interface CriterionScore {
  id: CriterionId;
  pass: boolean;
  reason: string;
}

export interface JudgeResult {
  rubricVersion: string;
  scores: CriterionScore[];
}

const SYSTEM = `You are an LLM-as-judge scoring the fidelity of a converted document artifact
against its source. Be strict and literal. You are checking semantic fidelity, not aesthetics.
For zero-tolerance criteria, default to FAIL if uncertain. Output ONLY valid JSON.`;

// Score a generated artifact against the source IR using the rubric.
// Human spot-checks expected periodically (PRD §12B) — this is the automated pass.
export async function judge(ir: DocIR, html: string): Promise<JudgeResult> {
  const criteriaBlock = CRITERIA.map(
    (c) => `- "${c.id}" (${c.zeroTolerance ? "ZERO-TOLERANCE" : "graded"}): ${c.question}`
  ).join("\n");

  const user = `SOURCE DOCUMENT (ground truth):
---
${irToPlainText(ir)}
---

GENERATED ARTIFACT (HTML):
---
${html}
---

Evaluate the artifact against each criterion below. For each, decide pass=true/false and give a one-sentence reason citing specifics.

CRITERIA:
${criteriaBlock}

Respond with ONLY this JSON shape:
{"scores":[{"id":"a_decision_above_fold","pass":true,"reason":"..."}, ...]}`;

  const raw = await complete({ role: "judge", system: SYSTEM, user, maxTokens: 2048 });
  const parsed = JSON.parse(extractJson(raw)) as { scores: CriterionScore[] };
  return { rubricVersion: RUBRIC_VERSION, scores: parsed.scores };
}

function extractJson(s: string): string {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`Judge returned no JSON object:\n${s}`);
  return s.slice(start, end + 1);
}
