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
DESIGN PROFILES — pick the single best fit for this document:
- "Tufte": High data-ink ratio. Dense information, margin-style asides via <details>/<summary>.
  Best for: technical, data-heavy, analytical documents.
- "Executive Brief": Highly skimmable, BLUF (Bottom Line Up Front), bullet-driven, clear hierarchy.
  Best for: decision memos, status updates, leadership summaries.
`.trim();

// ── Rendering spec ─────────────────────────────────────────────────────────────

// Doc-agnostic rendering principles injected into the conversion system prompt.
// The model determines the document purpose and the structure that best serves a reader.
// Owner decision 2026-05-30: no per-document-type templates; LLM judges the doc type.
export const RENDER_SPEC = `
You receive a document of UNKNOWN type. You decide what it is and what a reader needs.

Output a single self-contained HTML fragment (no <html>/<head>/<body>, no <script>, no external
CSS/JS/iframes). Render the document into the structure that best serves a reader, following these
principles for ANY document type:

1. SURFACE THE LEAD. Identify the single most load-bearing point/purpose of THIS document and
   place it first, above the fold, stated plainly. If the source buries it, lift it to the top.
2. PROGRESSIVE DISCLOSURE. Default view shows the digest; push depth into native
   <details><summary>…</summary>…</details> blocks. The reader controls depth.
3. STRUCTURE FOR COMPREHENSION, NOT DECORATION. Use hierarchy, grouping, tables, and anchored
   navigation to reduce reading cost. A plainly-styled, well-structured artifact beats a decorated,
   poorly-structured one.
4. SAFE PALETTE ONLY: <details>/<summary>, in-page <a href="#id"> anchors, title tooltips.
   NOTHING that executes JS. Give all targets stable id attributes; every anchor must resolve.
5. FIDELITY: do NOT fabricate content absent from the source; do NOT drop a material point;
   NEVER render a minor point more prominently than the document's main point.

${DESIGN_PROFILES}

You choose the sections, their order, and the visual grammar — there is no fixed template.
Auto-select and apply the best design profile for the document.
`.trim();
