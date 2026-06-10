import { complete } from "./client.ts";

export interface StructureCriterionScore {
  id: string;
  pass: boolean;
  reason: string;
}

export interface JudgeStructureResult {
  version: string;
  scores: StructureCriterionScore[];
}

const SYSTEM = `You are an LLM-as-judge scoring the structural heuristics, UI/UX, and design profile adherence of a generated document artifact.
You are evaluating pure HTML structure, not semantic fidelity to a source.
Output ONLY valid JSON.`;

const STRUCTURE_CRITERIA = [
  {
    id: "s_design_profile_adherence",
    question: "Does the document clearly apply a coherent design profile (like 'Tufte' or 'Executive Brief')?"
  },
  {
    id: "s_progressive_disclosure",
    question: "Does the document effectively use progressive disclosure (e.g., <details>/<summary>) to manage depth and reading cost?"
  },
  {
    id: "s_semantic_html",
    question: "Is the HTML semantic and well-structured (e.g., proper heading hierarchy, logical grouping, anchored navigation)?"
  }
];

// Score a generated artifact's structure and UI/UX.
export async function judgeStructure(html: string): Promise<JudgeStructureResult> {
  const criteriaBlock = STRUCTURE_CRITERIA.map(
    (c) => `- "${c.id}": ${c.question}`
  ).join("\n");

  const user = `GENERATED ARTIFACT (HTML):
---
${html}
---

Evaluate the HTML artifact against each criterion below. For each, decide pass=true/false and give a one-sentence reason citing specifics.

CRITERIA:
${criteriaBlock}

Respond with ONLY this JSON shape:
{"scores":[{"id":"s_design_profile_adherence","pass":true,"reason":"..."}, ...]}`;

  const raw = await complete({ role: "judge", system: SYSTEM, user, maxTokens: 2048 });
  const parsed = JSON.parse(extractJson(raw)) as { scores: StructureCriterionScore[] };
  return { version: "structure-v1", scores: parsed.scores };
}

function extractJson(s: string): string {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`Judge returned no JSON object:\n${s}`);
  return s.slice(start, end + 1);
}
