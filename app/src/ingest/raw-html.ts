import { semanticHtmlToDoc } from "./html-walker.js";
import type { TipTapDoc } from "../ir.js";

/** Maximum accepted size (5 MB). */
export const MAX_RAW_BYTES = 5 * 1024 * 1024;

export class RawIngestError extends Error {
  constructor(
    message: string,
    public readonly code: "EMPTY_INPUT" | "INPUT_TOO_LARGE" | "PARSE_FAILURE"
  ) {
    super(message);
    this.name = "RawIngestError";
  }
}

/**
 * Ingest a raw HTML or parsed Markdown string into a TipTapDoc IR.
 * This bypasses the aggressive GDoc sanitization (which strips classes/styles)
 * and directly relies on html-walker to extract the semantic structure.
 *
 * @param html        The raw HTML string.
 * @param sourceFile  A human-readable label.
 */
export function ingestRawHtml(html: string, sourceFile = "upload"): TipTapDoc {
  if (!html || html.trim() === "") {
    throw new RawIngestError("Input is empty.", "EMPTY_INPUT");
  }
  if (Buffer.byteLength(html, "utf8") > MAX_RAW_BYTES) {
    throw new RawIngestError(
      `Input too large (${(Buffer.byteLength(html, "utf8") / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`,
      "INPUT_TOO_LARGE"
    );
  }

  // 1. Extract body content if a full HTML document was uploaded.
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const fragment = bodyMatch?.[1] ?? html;

  if (!fragment || fragment.trim() === "") {
    throw new RawIngestError("HTML produced no content.", "EMPTY_INPUT");
  }

  // directly convert the fragment to IR
  return semanticHtmlToDoc(fragment.trim(), sourceFile);
}
