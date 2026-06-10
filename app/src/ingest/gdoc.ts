/**
 * Google Docs HTML paste → TipTap IR ingestion.
 *
 * When a user copies from Google Docs and pastes, the clipboard `text/html`
 * payload is a verbose document fragment. GDoc HTML has several quirks that
 * need to be sanitized before the shared html-walker can process it cleanly:
 *
 *  1. Headings as styled spans: GDoc sometimes emits headings as `<p>` with
 *     a `<span style="font-size:...">` rather than `<h1>`. This is uncommon
 *     when copying a full doc but happens with partial pastes.
 *
 *  2. Bold-that-isn't: `<b style="font-weight:normal">` — GDoc wraps many
 *     things in <b> but cancels it with inline style. Strip those.
 *
 *  3. Excessive `<span>` wrappers: GDoc wraps almost every text run in a
 *     span with font/color styles. We strip span wrappers, keeping only the
 *     inner text (and proper semantic marks like <strong>, <em>, <a>).
 *
 *  4. Meta headers: GDoc HTML begins with a long <head> + <style> block.
 *     We strip everything outside <body> before parsing.
 *
 *  5. `<br>` within paragraphs: treated as hard breaks.
 */

import { parse as parseHtml } from "node-html-parser";
import { semanticHtmlToDoc } from "./html-walker.js";
import type { TipTapDoc } from "../ir.js";

/** Maximum accepted paste size (5 MB). GDoc paste blobs are rarely this large. */
export const MAX_GDOC_BYTES = 5 * 1024 * 1024;

export class GDocIngestError extends Error {
  constructor(
    message: string,
    public readonly code: "EMPTY_INPUT" | "INPUT_TOO_LARGE" | "PARSE_FAILURE"
  ) {
    super(message);
    this.name = "GDocIngestError";
  }
}

/**
 * Sanitize GDoc clipboard HTML into clean semantic HTML.
 * Exported for testability.
 */
export function sanitizeGDocHtml(raw: string): string {
  // 1. Extract body content if a full HTML document was pasted.
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(raw);
  let fragment = bodyMatch?.[1] ?? raw;

  // 2. Strip <style>, <meta>, <script>, <link> blocks.
  fragment = fragment.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  fragment = fragment.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  fragment = fragment.replace(/<meta[^>]*\/?>/gi, "");
  fragment = fragment.replace(/<link[^>]*\/?>/gi, "");

  // 3. Remove GDoc wrapper divs (docs-internal-guid-... wrappers are layout-only).
  fragment = fragment.replace(/<div[^>]*id="docs-internal-guid[^"]*"[^>]*>/gi, "");

  // 4. Strip <b style="font-weight:normal"> (bold-that-isn't) — open tag only.
  //    The </b> remains and is harmless (walker treats remaining <b> as bold).
  fragment = fragment.replace(/<b[^>]*font-weight:\s*normal[^>]*>/gi, "");

  // 5. Unwrap ALL <span> elements — GDoc uses spans for every text run with
  //    font/color/size/class styling we intentionally discard.
  //    \b ensures we match <span> and <span ...> but not e.g. <spanner>.
  fragment = fragment.replace(/<span\b[^>]*>/gi, "");
  fragment = fragment.replace(/<\/span>/gi, "");

  // 6. Strip all inline style attributes from any remaining tags.
  fragment = fragment.replace(/\s+style="[^"]*"/gi, "");

  // 7. Strip all class attributes.
  fragment = fragment.replace(/\s+class="[^"]*"/gi, "");

  // 8. Collapse runs of whitespace-only text between block tags.
  //    Runs AFTER span removal so block-level structure (ul, table, etc.) survives.
  fragment = fragment.replace(/>\s+</g, "><");

  return fragment.trim();
}

/**
 * Ingest a Google Docs clipboard HTML paste into a TipTapDoc IR.
 *
 * @param html        The raw `text/html` clipboard payload from GDocs.
 * @param sourceFile  A human-readable label (e.g. "My Doc (GDoc paste)").
 */
export function ingestGDocHtml(html: string, sourceFile = "gdoc-paste"): TipTapDoc {
  if (!html || html.trim() === "") {
    throw new GDocIngestError("Input is empty.", "EMPTY_INPUT");
  }
  if (Buffer.byteLength(html, "utf8") > MAX_GDOC_BYTES) {
    throw new GDocIngestError(
      `Input too large (${(Buffer.byteLength(html, "utf8") / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`,
      "INPUT_TOO_LARGE"
    );
  }

  let clean: string;
  try {
    clean = sanitizeGDocHtml(html);
  } catch (err) {
    throw new GDocIngestError(
      `Sanitization failed: ${err instanceof Error ? err.message : String(err)}`,
      "PARSE_FAILURE"
    );
  }

  if (!clean || clean.trim() === "") {
    throw new GDocIngestError(
      "GDoc HTML produced no content after sanitization.",
      "EMPTY_INPUT"
    );
  }

  return semanticHtmlToDoc(clean, sourceFile);
}
