/**
 * .docx → TipTap IR ingestion.
 *
 * Pipeline:
 *   .docx bytes  →  mammoth.js  →  clean semantic HTML  →  html-walker  →  TipTapDoc
 *
 * mammoth strips Word-specific styles and emits semantic tags only
 * (h1–h6, p, ul/ol/li, table, img). The html-walker then converts that to IR.
 */

import mammoth from "mammoth";
import { basename } from "node:path";
import { semanticHtmlToDoc } from "./html-walker.js";
import type { TipTapDoc } from "../ir.js";

/** Maximum accepted file size (10 MB). Matches ADR note on JSONB size thresholds. */
export const MAX_DOCX_BYTES = 10 * 1024 * 1024;

export class IngestError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "EMPTY_FILE"
      | "FILE_TOO_LARGE"
      | "UNSUPPORTED_FORMAT"
      | "PARSE_FAILURE"
  ) {
    super(message);
    this.name = "IngestError";
  }
}

/**
 * Ingest a .docx from a filesystem path.
 * @param filePath  Absolute or relative path to the .docx file.
 */
export async function ingestDocxFromPath(filePath: string): Promise<TipTapDoc> {
  const { readFile, stat } = await import("node:fs/promises");

  let stats: Awaited<ReturnType<typeof stat>>;
  try {
    stats = await stat(filePath);
  } catch {
    throw new IngestError(`File not found or unreadable: ${filePath}`, "PARSE_FAILURE");
  }

  if (stats.size === 0) {
    throw new IngestError("File is empty.", "EMPTY_FILE");
  }
  if (stats.size > MAX_DOCX_BYTES) {
    throw new IngestError(
      `File is too large (${(stats.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`,
      "FILE_TOO_LARGE"
    );
  }

  const buffer = await readFile(filePath);
  return ingestDocxFromBuffer(buffer, basename(filePath));
}

/**
 * Ingest a .docx from an in-memory Buffer.
 * Use this for upload endpoints where you already have the bytes.
 * @param buffer    Raw bytes of the .docx file.
 * @param fileName  Original filename (used for sourceFile metadata).
 */
export async function ingestDocxFromBuffer(
  buffer: Buffer,
  fileName: string
): Promise<TipTapDoc> {
  if (!buffer || buffer.length === 0) {
    throw new IngestError("Buffer is empty.", "EMPTY_FILE");
  }
  if (buffer.length > MAX_DOCX_BYTES) {
    throw new IngestError(
      `Document too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`,
      "FILE_TOO_LARGE"
    );
  }

  let html: string;
  try {
    const result = await mammoth.convertToHtml({ buffer });
    html = result.value;
  } catch (err) {
    throw new IngestError(
      `mammoth failed to parse the .docx: ${err instanceof Error ? err.message : String(err)}`,
      "PARSE_FAILURE"
    );
  }

  if (!html || html.trim() === "") {
    throw new IngestError("Document produced no content after conversion.", "EMPTY_FILE");
  }

  return semanticHtmlToDoc(html, fileName);
}
