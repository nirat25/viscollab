/**
 * P2-T1 deterministic tests: .docx ingestion
 *
 * PRD P2-T1 test contract:
 *  1. per-element parse: heading/list/table/image → correct IR node type
 *  2. malformed/empty file → graceful error, no crash
 *  3. oversized doc → handled within defined limits
 *  4. (mixed-formatting GDoc paste: covered in gdoc.test.ts)
 */

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ingestDocxFromPath,
  ingestDocxFromBuffer,
  IngestError,
  MAX_DOCX_BYTES,
} from "../../src/ingest/index.js";
import type { HeadingNode, BulletListNode, TableNode, TipTapDoc } from "../../src/ingest/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "../fixtures");
const SAMPLE_DOCX = join(FIXTURES, "sample.docx");

// ── Helpers ──────────────────────────────────────────────────────────────────

function findNodes<T extends { type: string }>(
  doc: TipTapDoc,
  type: string
): T[] {
  return doc.content.filter((n): n is T => n.type === type);
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("ingestDocxFromPath", () => {
  it("produces a valid TipTapDoc from sample.docx", async () => {
    const doc = await ingestDocxFromPath(SAMPLE_DOCX);
    expect(doc.type).toBe("doc");
    expect(doc.docType).toBe("auto");
    expect(doc.sourceFile).toBe("sample.docx");
    expect(doc.content.length).toBeGreaterThan(0);
  });

  // PRD test 1a: headings → HeadingNode with correct level
  it("parses h1 heading correctly", async () => {
    const doc = await ingestDocxFromPath(SAMPLE_DOCX);
    const headings = findNodes<HeadingNode>(doc, "heading");
    expect(headings.length).toBeGreaterThan(0);
    const h1 = headings.find((h) => h.attrs.level === 1);
    expect(h1).toBeDefined();
    const h1Text = h1!.content.map((n) => ("text" in n ? n.text : "")).join("");
    expect(h1Text).toContain("Vendor Consolidation");
  });

  it("parses h2 headings correctly", async () => {
    const doc = await ingestDocxFromPath(SAMPLE_DOCX);
    const headings = findNodes<HeadingNode>(doc, "heading");
    const h2s = headings.filter((h) => h.attrs.level === 2);
    expect(h2s.length).toBeGreaterThanOrEqual(2); // Background, Recommendation, Cost Comparison, Conclusion
  });

  // PRD test 1b: list → BulletListNode with items
  it("parses bullet list correctly", async () => {
    const doc = await ingestDocxFromPath(SAMPLE_DOCX);
    const lists = findNodes<BulletListNode>(doc, "bulletList");
    expect(lists.length).toBeGreaterThan(0);
    const firstList = lists[0]!;
    expect(firstList.content.length).toBeGreaterThanOrEqual(2); // at least 2 items
    // Each list item has a paragraph child
    for (const item of firstList.content) {
      expect(item.type).toBe("listItem");
      expect(item.content.length).toBeGreaterThan(0);
    }
  });

  // PRD test 1c: table → TableNode with header row and body rows
  it("parses table with headers and rows", async () => {
    const doc = await ingestDocxFromPath(SAMPLE_DOCX);
    const tables = findNodes<TableNode>(doc, "table");
    expect(tables.length).toBeGreaterThan(0);
    const table = tables[0]!;
    // First row should be the header row
    expect(table.content.length).toBeGreaterThanOrEqual(2); // header + at least 1 body row
    const firstRow = table.content[0]!;
    // Header cells exist
    expect(firstRow.content.length).toBeGreaterThan(0);
    // Cell text includes "Vendor"
    const cellTexts = firstRow.content.flatMap((c) =>
      c.content.flatMap((p) => p.content.map((t) => ("text" in t ? t.text : "")))
    );
    expect(cellTexts.join("")).toMatch(/vendor/i);
  });

  // PRD test 1d: paragraphs with inline marks preserved
  it("preserves bold marks on inline text runs", async () => {
    const doc = await ingestDocxFromPath(SAMPLE_DOCX);
    const allTextNodes = doc.content.flatMap((b) => {
      if (b.type === "paragraph") return b.content;
      return [];
    });
    const boldNodes = allTextNodes.filter(
      (n) => n.type === "text" && n.marks?.some((m) => m.type === "bold")
    );
    expect(boldNodes.length).toBeGreaterThan(0);
  });
});

describe("ingestDocxFromBuffer", () => {
  it("produces the same IR as path-based ingestion", async () => {
    const buffer = await readFile(SAMPLE_DOCX);
    const docFromBuffer = await ingestDocxFromBuffer(buffer, "sample.docx");
    const docFromPath = await ingestDocxFromPath(SAMPLE_DOCX);
    // Same number of top-level blocks
    expect(docFromBuffer.content.length).toBe(docFromPath.content.length);
    expect(docFromBuffer.type).toBe("doc");
  });

  // PRD test 2: malformed file → graceful error, no crash
  it("throws IngestError with PARSE_FAILURE for corrupt binary data", async () => {
    const corrupt = Buffer.from("this is not a docx file at all", "utf8");
    await expect(ingestDocxFromBuffer(corrupt, "corrupt.docx")).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof IngestError &&
        (e.code === "PARSE_FAILURE" || e.code === "EMPTY_FILE")
    );
  });

  // PRD test 2: empty file → graceful error, no crash
  it("throws IngestError with EMPTY_FILE for empty buffer", async () => {
    await expect(ingestDocxFromBuffer(Buffer.alloc(0), "empty.docx")).rejects.toSatisfy(
      (e: unknown) => e instanceof IngestError && e.code === "EMPTY_FILE"
    );
  });

  // PRD test 3: oversized doc → handled within limits
  it("throws IngestError with FILE_TOO_LARGE when buffer exceeds MAX_DOCX_BYTES", async () => {
    // Simulate a 10 MB + 1 byte buffer
    const oversized = Buffer.alloc(MAX_DOCX_BYTES + 1, 0x41);
    await expect(ingestDocxFromBuffer(oversized, "big.docx")).rejects.toSatisfy(
      (e: unknown) => e instanceof IngestError && e.code === "FILE_TOO_LARGE"
    );
  });
});

describe("ingestDocxFromPath error cases", () => {
  // PRD test 2: missing file → graceful error, no crash
  it("throws IngestError for a non-existent file", async () => {
    await expect(
      ingestDocxFromPath(join(FIXTURES, "does-not-exist.docx"))
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof IngestError && e.code === "PARSE_FAILURE"
    );
  });
});
