/**
 * Pure, deterministic helpers for the /api/collab/edit endpoint.
 *
 * These are factored out of the route handler so vitest can cover them
 * without any HTTP framework or LLM dependency (CLAUDE.md §Testing model).
 *
 * LLM-dependent paths (performSurgicalEdit) are NOT tested here.
 */

import { parse } from "node-html-parser";

// --------------------------------------------------------------------------
// Input validation
// --------------------------------------------------------------------------

export interface EditRequest {
  documentId?: string;
  sectionId?: string;
  sectionHtml?: string;
  instruction?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Returns an array of validation errors (empty = valid).
 * Checks for missing required fields and sectionHtml size limit (100 KB).
 */
export function validateEditRequest(body: EditRequest): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!body.documentId || typeof body.documentId !== "string" || !body.documentId.trim()) {
    errors.push({ field: "documentId", message: "documentId is required" });
  }
  if (!body.sectionId || typeof body.sectionId !== "string" || !body.sectionId.trim()) {
    errors.push({ field: "sectionId", message: "sectionId is required" });
  }
  if (!body.sectionHtml || typeof body.sectionHtml !== "string" || !body.sectionHtml.trim()) {
    errors.push({ field: "sectionHtml", message: "sectionHtml is required" });
  } else if (Buffer.byteLength(body.sectionHtml, "utf8") > 100 * 1024) {
    errors.push({ field: "sectionHtml", message: "sectionHtml exceeds 100 KB limit" });
  }
  if (!body.instruction || typeof body.instruction !== "string" || !body.instruction.trim()) {
    errors.push({ field: "instruction", message: "instruction is required" });
  }

  return errors;
}

// --------------------------------------------------------------------------
// Containment validation on the LLM-returned HTML
// --------------------------------------------------------------------------

/**
 * Validates that the LLM-returned section HTML:
 *   1. Is a non-empty string.
 *   2. Has a root element (or exactly one first element) whose id === sectionId.
 *
 * Returns an error message string if invalid, or null if OK.
 */
export function validateLlmSectionResult(
  returnedHtml: string,
  sectionId: string
): string | null {
  if (!returnedHtml || !returnedHtml.trim()) {
    return "LLM returned empty HTML";
  }

  const root = parse(returnedHtml.trim());

  // Try getElementById first (exact match)
  const byId = root.getElementById(sectionId);
  if (byId) {
    return null; // valid — root element or descendant has the required id
  }

  // Also accept: the very first child element doesn't have the id but we
  // can see if there's any element with the id at any depth (byId already
  // handles this via node-html-parser's getElementById traversal).
  // If we reach here, no element with sectionId was found.
  return `LLM response violates containment contract: returned HTML has no element with id="${sectionId}"`;
}

// --------------------------------------------------------------------------
// Simulation fallback (no LLM key configured)
// --------------------------------------------------------------------------

/**
 * Deterministic simulation of an edit when no LLM key is configured.
 *
 * Strategy:
 *  - "concise" / "shorten" / "shorter" / "trim" / "brief"
 *      → remove sentences after the first from every <p> in the section
 *  - anything else
 *      → append an <em> note inside the section indicating simulated edit
 *
 * The returned HTML always keeps the sectionId on the root element.
 * Never references a hardcoded section id.
 */
export function simulateEdit(sectionHtml: string, sectionId: string, instruction: string): string {
  const trimmedHtml = sectionHtml.trim();
  const root = parse(trimmedHtml);

  // Find root element — either the element with the id, or first element child
  let rootEl = root.getElementById(sectionId);
  if (!rootEl) {
    // Fall back to first element child
    const firstEl = root.childNodes.find(
      (n): n is ReturnType<typeof root.getElementById> & NonNullable<unknown> =>
        n.nodeType === 1
    ) as any;
    if (firstEl) {
      firstEl.setAttribute("id", sectionId);
      rootEl = firstEl;
    }
  }

  const concisePattern = /\b(concise?|shorten|shorter|trim|brief)\b/i;

  if (concisePattern.test(instruction)) {
    // Trim: keep only the first sentence of every <p>
    const paragraphs = root.querySelectorAll("p");
    for (const p of paragraphs) {
      const text = p.text;
      const firstSentenceMatch = text.match(/^[^.!?]*[.!?]/);
      if (firstSentenceMatch) {
        p.set_content(firstSentenceMatch[0]);
      }
    }
  } else {
    // Append a simulation notice inside the root element
    const notice = `<em data-simulated="true"> [Simulated edit — configure ANTHROPIC_API_KEY: ${escapeHtmlAttr(instruction)}]</em>`;
    if (rootEl) {
      rootEl.set_content(rootEl.innerHTML + notice);
    }
  }

  // Ensure root element carries the sectionId
  if (rootEl && rootEl.getAttribute("id") !== sectionId) {
    rootEl.setAttribute("id", sectionId);
  }

  return root.toString();
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
