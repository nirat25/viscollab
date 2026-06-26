/**
 * Conversion pipeline core (P2-T2).
 * Productionised from spike/src/convert.ts.
 *
 * Flow: TipTapDoc IR → prompt text → LLM → raw HTML → strip fences → validate contract → ConversionResult
 *
 * Key differences from the spike:
 *  - Accepts the production TipTapDoc IR (P2-T1) rather than the spike's DocIR.
 *  - Uses tipTapDocToPromptText() to serialise (Markdown-flavoured, token-efficient).
 *  - Wires the ProgressReporter for legible loading states (PRD §10.3).
 *  - Prompt version is bumped on any prompt change, recorded in the result for CI attribution.
 *  - buildPrompt() is exported for deterministic testing without LLM calls.
 */

import { RENDER_SPEC } from "./template.js";
import { complete, getModel } from "./client.js";
import { tipTapDocToPromptText } from "./ir-to-text.js";
import { validateContract, type ContractResult } from "./template.js";
import { validateDisclosure, type DisclosureResult } from "../render/renderer.js";
import { ProgressReporter, silentReporter } from "./progress.js";
import type { TipTapDoc } from "../ir.js";

/**
 * Bump this on any system/user prompt change.
 * The CI regression harness uses this to attribute fidelity scores to prompt versions.
 */
export const PROMPT_VERSION = "conv-v4-tiptap-ir";

export interface ConversionResult {
  /** The generated HTML artifact fragment (self-contained, no <html>/<head>/<body>). */
  html: string;
  /** Structural safety + comprehension signals. */
  contract: ContractResult;
  /** Progressive disclosure DoD validation (P2-T3). */
  disclosure: DisclosureResult;
  /** Prompt version tag for regression tracking. */
  promptVersion: string;
  /** Actual model used. */
  model: string;
  /** Source file name from the IR. */
  sourceFile: string;
}

// System prompt — shared across all documents; cached on the Anthropic tier.
const SYSTEM = `You are a document conversion processor for a review-and-alignment platform.
Your job: convert ANY document — you determine its type and purpose yourself — into a structured,
interactive HTML artifact that makes its load-bearing point impossible to miss and progressively
discloses supporting detail.

You serve the READER, not the author. The win is information architecture and cognitive-load
reduction — NOT visual richness. A plainly-styled, beautifully-structured artifact beats a
decorated, poorly-structured one.

${RENDER_SPEC}

Return ONLY the HTML fragment. No prose, no markdown fences, no explanation.`;

/**
 * Build the user prompt for a document.
 * Exported for deterministic testing (no LLM call needed).
 */
export function buildPrompt(doc: TipTapDoc): string {
  const text = tipTapDocToPromptText(doc);
  return `Convert this document into the artifact. First judge what it is, then render it.

SOURCE DOCUMENT (as structured text):
---
${text}
---

Output the HTML fragment now.`;
}

/**
 * Strip accidental \`\`\`html … \`\`\` fences if the model adds them despite instructions.
 * Exported for deterministic testing.
 */
export function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Convert a TipTapDoc IR to a structured HTML artifact via the LLM.
 *
 * @param doc       The TipTapDoc produced by the P2-T1 ingestion layer.
 * @param progress  Optional ProgressReporter for legible loading states (PRD §10.3).
 */
export async function convertIR(
  doc: TipTapDoc,
  progress: ProgressReporter = silentReporter
): Promise<ConversionResult> {
  progress.report("converting", `Sending to ${getModel("convert")}…`);

  const rawHtml = await complete({
    role: "convert",
    system: SYSTEM,
    user: buildPrompt(doc),
    maxTokens: 16384, // large docs can overflow 8k
  });

  const html = stripFences(rawHtml);

  progress.report("validating", "Checking structural contract…");
  const contract = validateContract(html);

  progress.report("validating", "Checking progressive disclosure…");
  const disclosure = validateDisclosure(html);

  progress.report("done", `Done. Contract: ${contract.valid ? "OK" : "FAILED"}, Disclosure: ${disclosure.valid ? "OK" : "FAILED"}`);

  return {
    html,
    contract,
    disclosure,
    promptVersion: PROMPT_VERSION,
    model: getModel("convert"),
    sourceFile: doc.sourceFile,
  };
}
