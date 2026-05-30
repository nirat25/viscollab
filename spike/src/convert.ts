import type { DocIR } from "./ir.ts";
import { irToPlainText } from "./ir.ts";
import { RENDER_SPEC } from "./template.ts";
import { complete, getModel } from "./client.ts";

// Prompt version — bump on any change to system/user prompt. Recorded with every
// eval result so fidelity scores are attributable to a prompt version (PRD P1-T1
// "records per-prompt-version results"; P2-T2 regression gate).
export const PROMPT_VERSION = "conv-v2-docagnostic";

const SYSTEM = `You are a document conversion processor for a review-and-alignment platform.
Your job: convert ANY document — you determine its type and purpose yourself — into a structured,
interactive HTML artifact that makes its load-bearing point impossible to miss and progressively
discloses supporting detail.

You serve the READER, not the author. The win is information architecture and cognitive-load
reduction — NOT visual richness. A plainly-styled, beautifully-structured artifact beats a
decorated, poorly-structured one.

${RENDER_SPEC}

Return ONLY the HTML fragment. No prose, no markdown fences, no explanation.`;

export interface ConversionResult {
  html: string;
  promptVersion: string;
  model: string;
}

export async function convert(ir: DocIR): Promise<ConversionResult> {
  const user = `Convert this document into the artifact. First judge what it is, then render it.

SOURCE DOCUMENT (as structured text):
---
${irToPlainText(ir)}
---

Output the HTML fragment now.`;

  const html = await complete({
    role: "convert",
    system: SYSTEM,
    user,
    maxTokens: 16384, // large docs (e.g. the 25-section golden doc) overflow 8k
  });

  return { html: stripFences(html), promptVersion: PROMPT_VERSION, model: getModel("convert") };
}

// Defensive: strip accidental ```html fences if the model adds them.
function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
