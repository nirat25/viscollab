/**
 * Public ingestion API for HTMLCollab (P2-T1).
 *
 * Consumers import from here; internal module structure is an implementation detail.
 *
 * Usage:
 *   import { ingestDocxFromBuffer, ingestGDocHtml, IngestError } from "./ingest/index.js";
 */

export { ingestDocxFromPath, ingestDocxFromBuffer, IngestError, MAX_DOCX_BYTES } from "./docx.js";
export { ingestGDocHtml, GDocIngestError, MAX_GDOC_BYTES } from "./gdoc.js";
export { sanitizeGDocHtml } from "./gdoc.js";
export { ingestRawHtml, RawIngestError, MAX_RAW_BYTES } from "./raw-html.js";

// Re-export IR types for convenience so callers don't need a second import.
export type {
  TipTapDoc,
  BlockNode,
  HeadingNode,
  ParagraphNode,
  BulletListNode,
  OrderedListNode,
  ListItemNode,
  TableNode,
  TableRowNode,
  TableHeaderNode,
  TableCellNode,
  ImageNode,
  TextNode,
  Mark,
} from "../ir.js";
export { nodeToPlainText, irSummary } from "../ir.js";
