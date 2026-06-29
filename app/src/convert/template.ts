/**
 * Rendering spec + structural validator (P2-T2).
 * Productionised from spike/src/template.ts.
 *
 * This module owns two things:
 *  1. RENDER_SPEC — the doc-agnostic comprehension principles injected into the
 *     conversion system prompt. The platform owns the visual grammar; the author makes no choices.
 *  2. validateContract() — deterministic structural safety check on the generated HTML.
 *     No LLM. Enforces the safe interaction palette (PRD §9: no arbitrary JS) and
 *     reports comprehension signals (progressive disclosure, heading coverage).
 */

import { parse } from "node-html-parser";

// ── Contract result ────────────────────────────────────────────────────────────

export interface ContractResult {
  valid: boolean;
  // HARD failures (security / integrity — any one of these fails the contract):
  hasScript: boolean;           // <script> present
  hasInlineHandlers: boolean;   // on*="" event attributes
  hasExternalResources: boolean; // external <link rel=stylesheet>, <iframe>, <object>/<embed>
  brokenAnchors: string[];      // href="#id" with no matching id in the document
  // SOFT signals (reported, not failed — info for the eval harness):
  progressiveDisclosure: boolean; // uses <details> or aria-expanded
  headingCount: number;
  errors: string[];
}

/**
 * Deterministic structural validator — no API key needed.
 * Enforces the safe interaction palette and reports comprehension signals.
 * Run this on every generated artifact before storing or displaying it.
 */
export function validateContract(html: string): ContractResult {
  const errors: string[] = [];
  const root = parse(html, { comment: false });

  // Hard check 1: <script> tags
  const hasScript = root.querySelectorAll("script").length > 0;
  if (hasScript) errors.push("contains <script> — outside the safe interaction palette (PRD §9)");

  // Hard check 2: inline event handlers (onclick, onload, onerror, …)
  const hasInlineHandlers = root
    .querySelectorAll("*")
    .some((el) => Object.keys(el.attributes).some((a) => /^on/i.test(a)));
  if (hasInlineHandlers) errors.push("contains inline JS event handlers (on*=) — violates safe palette");

  // Hard check 3: external resources — artifact must be fully self-contained
  const externalStylesheet = root
    .querySelectorAll("link")
    .some((el) => (el.getAttribute("rel") ?? "").includes("stylesheet"));
  const hasExternalResources =
    externalStylesheet ||
    root.querySelectorAll("iframe").length > 0 ||
    root.querySelectorAll("object,embed").length > 0;
  if (hasExternalResources)
    errors.push("references external resources — artifact must be self-contained (no external CSS/JS/iframes)");

  // Hard check 4: broken internal anchors
  const ids = new Set(
    root.querySelectorAll("[id]").map((el) => el.getAttribute("id") ?? "")
  );
  const brokenAnchors: string[] = [];
  for (const a of root.querySelectorAll('a[href^="#"]')) {
    const target = (a.getAttribute("href") ?? "").slice(1);
    if (target && !ids.has(target)) brokenAnchors.push(target);
  }
  if (brokenAnchors.length)
    errors.push(`broken internal anchors: ${brokenAnchors.join(", ")}`);

  // Soft signals
  const progressiveDisclosure =
    root.querySelectorAll("details").length > 0 ||
    root.querySelectorAll("[aria-expanded]").length > 0;
  const headingCount = root.querySelectorAll("h1,h2,h3,h4,h5,h6").length;

  const valid =
    !hasScript &&
    !hasInlineHandlers &&
    !hasExternalResources &&
    brokenAnchors.length === 0;

  return {
    valid,
    hasScript,
    hasInlineHandlers,
    hasExternalResources,
    brokenAnchors,
    progressiveDisclosure,
    headingCount,
    errors,
  };
}

// ── Design profiles ────────────────────────────────────────────────────────────

export const DESIGN_PROFILES = `
VISUAL COMPONENT LIBRARY — You are a Design System Orchestrator. You MUST use these exact HTML structures. DO NOT invent your own classes.
- "BLUF": Always use for the primary executive summary at the top.
  <div class="vcd-bluf"><div class="label">Primary Conclusion</div><h2 class="headline">...</h2><p class="subhead">...</p></div>
- "Timeline / Flow": Best for roadmaps, processes, or chronological points.
  <div class="vcd-node-container">
    <div class="vcd-node"><h3 class="vcd-node-title">...</h3><div class="vcd-node-body">...</div></div>
  </div>
- "Lateral Grid": Best for comparisons, matrices, or discrete parallel ideas.
  <div class="vcd-card-grid">
    <div class="vcd-card"><h3 class="vcd-card-title">...</h3><p class="vcd-card-body">...</p></div>
  </div>
- "Progressive Disclosure": Mandatory for dense, deep-dive information to prevent text walls.
  <details class="vcd-accordion"><summary>...</summary><div class="accordion-body">...</div></details>
- "Data": For tabular data. Use <tr class="highlight"> for recommended rows.
  <table class="vcd-table"><thead>...</thead><tbody>...</tbody></table>
- "Tags": For metadata inside titles or cards.
  <span class="badge badge-primary">...</span> or <span class="badge badge-secondary">...</span>
`.trim();

// ── Rendering spec ─────────────────────────────────────────────────────────────

// Doc-agnostic rendering principles injected into the conversion system prompt.
// The model determines the document purpose and the structure that best serves a reader.
// Owner decision 2026-05-30: no per-document-type templates; LLM judges the doc type.
export const RENDER_SPEC = `
You receive a document of UNKNOWN type. You decide what it is and what a reader needs.

Output a single self-contained HTML fragment wrapped in <div class="vcd-wrap" id="top">. 
(No <html>/<head>/<body>, no <script>, no inline CSS or <style>, no external resources). 
Render the document into the structure that best serves a reader, following these principles:

1. SURFACE THE LEAD. Identify the single most load-bearing point/purpose of THIS document and place it first in a "vcd-bluf" block.
2. ORCHESTRATE DESIGN. Do not output raw text walls. Use the provided Visual Component Library to structure the information based on its semantic meaning (e.g., timelines for processes, grids for comparisons).
3. PROGRESSIVE DISCLOSURE. Default view shows the digest. Push depth and verbosity into "vcd-accordion" blocks. The reader controls depth.
4. SAFE PALETTE ONLY: Use only the provided component classes and safe HTML. NOTHING that executes JS. Give all major targets stable id attributes.
5. FIDELITY: Do NOT fabricate content absent from the source; do NOT drop a material point.

\${DESIGN_PROFILES}

You choose the sections, their order, and which components to use. Assemble the optimal layout for this specific document.
`.trim();
