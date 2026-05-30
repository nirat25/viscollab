import { parse } from "node-html-parser";

// DOC-AGNOSTIC contract. No per-document-type template / required regions — the
// LLM judges the document and chooses its own structure (owner decision 2026-05-30).
// What the platform still owns and enforces, for ANY document:
//   - reader-first comprehension principles (in RENDER_SPEC, fed to the model)
//   - safety + structural integrity (validated deterministically here)
// This preserves tenets #2 (structure over decoration) and #5 (platform owns the
// visual grammar, not the author) without forcing content into a fixed shape.

export interface ContractResult {
  valid: boolean;
  // HARD fails (security / integrity):
  hasScript: boolean; // <script> present
  hasInlineHandlers: boolean; // on*="" attributes
  hasExternalResources: boolean; // external <link>/<iframe>/<object> — artifact must be self-contained
  brokenAnchors: string[]; // href="#id" with no matching id
  // SOFT signals (reported, not failed): did the model actually structure for reading?
  progressiveDisclosure: boolean; // uses <details> or aria-expanded
  headingCount: number;
  errors: string[];
}

// Deterministic validation — no LLM. Enforces the safe interaction palette
// (PRD §9: no arbitrary JS) and structural integrity; reports comprehension signals.
export function validateContract(html: string): ContractResult {
  const errors: string[] = [];
  const root = parse(html, { comment: false });

  const hasScript = root.querySelectorAll("script").length > 0;
  if (hasScript) errors.push("contains <script> — outside the safe interaction palette");

  // inline event handlers (onclick, onload, ...) — also arbitrary JS
  const hasInlineHandlers = root
    .querySelectorAll("*")
    .some((el) => Object.keys(el.attributes).some((a) => /^on/i.test(a)));
  if (hasInlineHandlers) errors.push("contains inline JS event handlers (on*)");

  const externalLink = root
    .querySelectorAll("link")
    .some((el) => (el.getAttribute("rel") ?? "").includes("stylesheet"));
  const hasExternalResources =
    externalLink ||
    root.querySelectorAll("iframe").length > 0 ||
    root.querySelectorAll("object,embed").length > 0;
  if (hasExternalResources) errors.push("references external resources — artifact must be self-contained");

  const ids = new Set(root.querySelectorAll("[id]").map((el) => el.getAttribute("id") ?? ""));
  const brokenAnchors: string[] = [];
  for (const a of root.querySelectorAll('a[href^="#"]')) {
    const target = (a.getAttribute("href") ?? "").slice(1);
    if (target && !ids.has(target)) brokenAnchors.push(target);
  }
  if (brokenAnchors.length) errors.push(`broken anchors: ${brokenAnchors.join(", ")}`);

  const progressiveDisclosure =
    root.querySelectorAll("details").length > 0 || root.querySelectorAll("[aria-expanded]").length > 0;
  const headingCount = root.querySelectorAll("h1,h2,h3,h4,h5,h6").length;

  const valid =
    !hasScript && !hasInlineHandlers && !hasExternalResources && brokenAnchors.length === 0;

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

// Doc-agnostic rendering spec injected into the conversion prompt. Principles, not
// a template. The model determines the document's purpose and the structure that
// best serves a reader.
export const RENDER_SPEC = `
You receive a document of UNKNOWN type. You decide what it is and what a reader needs.

Output a single self-contained HTML fragment (no <html>/<head>/<body>, no <script>, no external
CSS/JS/iframes). Render the document into the structure that best serves a reader, following these
principles for ANY document type:

1. SURFACE THE LEAD. Identify the single most load-bearing point/purpose of THIS document and place
   it first, above the fold, stated plainly. If the source buries it, lift it to the top.
2. PROGRESSIVE DISCLOSURE. Default view is the digest; push depth into native
   <details><summary>…</summary>…</details> blocks. The reader controls depth.
3. STRUCTURE FOR COMPREHENSION, NOT DECORATION. Use hierarchy, grouping, tables, and anchored
   navigation to reduce reading cost. A plain, well-structured artifact beats a decorated, messy one.
4. SAFE PALETTE ONLY: <details>/<summary>, in-page <a href="#id"> anchors, title tooltips. NOTHING
   that executes JS. Give targets stable id attributes; every anchor must resolve.
5. FIDELITY: do NOT fabricate content absent from the source; do NOT drop a material point; NEVER
   render a minor point more prominently than the document's main point.

You choose the sections, their order, and the visual grammar — there is no fixed template.
`.trim();
