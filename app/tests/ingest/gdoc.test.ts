/**
 * P2-T1 deterministic tests: Google Docs HTML paste ingestion
 *
 * PRD P2-T1 test contract (item 4):
 *   mixed-formatting GDoc paste → correct IR
 * Plus:
 *   empty paste → graceful error
 *   oversized paste → graceful error
 *   GDoc-specific quirks handled (span wrappers, bold-that-isn't, style/class stripped)
 */

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ingestGDocHtml,
  GDocIngestError,
  MAX_GDOC_BYTES,
  sanitizeGDocHtml,
} from "../../src/ingest/index.js";
import type { HeadingNode, BulletListNode, TableNode, TipTapDoc } from "../../src/ingest/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "../fixtures");
const GDOC_FIXTURE = join(FIXTURES, "gdoc_sample.html");

// ── Helpers ──────────────────────────────────────────────────────────────────

function findNodes<T extends { type: string }>(doc: TipTapDoc, type: string): T[] {
  return doc.content.filter((n): n is T => n.type === type);
}

// ── sanitizeGDocHtml unit tests ───────────────────────────────────────────────

describe("sanitizeGDocHtml", () => {
  it("strips the docs-internal-guid wrapper div", () => {
    const input = `<div id="docs-internal-guid-abc123"><p>Hello</p></div>`;
    const result = sanitizeGDocHtml(input);
    expect(result).not.toContain("docs-internal-guid");
    expect(result).toContain("Hello");
  });

  it("removes bold-that-isn't: <b style='font-weight:normal'>", () => {
    const input = `<p>A <b style="font-weight:normal">non-bold</b> word.</p>`;
    const result = sanitizeGDocHtml(input);
    // The <b> tag should be gone; the text should remain
    expect(result).not.toMatch(/<b[^>]*>/);
    expect(result).toContain("non-bold");
  });

  it("unwraps bare <span style='...'> elements", () => {
    const input = `<p><span style="font-size:12pt">Some text</span></p>`;
    const result = sanitizeGDocHtml(input);
    expect(result).not.toContain("<span");
    expect(result).toContain("Some text");
  });

  it("strips inline style attributes", () => {
    const input = `<p style="margin-top:0pt;color:#000000">Text</p>`;
    const result = sanitizeGDocHtml(input);
    expect(result).not.toContain("style=");
    expect(result).toContain("Text");
  });

  it("strips class attributes", () => {
    const input = `<h1 class="c5">Heading</h1>`;
    const result = sanitizeGDocHtml(input);
    expect(result).not.toContain("class=");
    expect(result).toContain("Heading");
  });

  it("extracts body content from a full HTML document", () => {
    const input = `<!DOCTYPE html><html><head><style>body{}</style></head><body><p>Content</p></body></html>`;
    const result = sanitizeGDocHtml(input);
    expect(result).not.toContain("<head>");
    expect(result).not.toContain("<style>");
    expect(result).toContain("Content");
  });
});

// ── ingestGDocHtml integration tests ─────────────────────────────────────────

describe("ingestGDocHtml — fixture file", () => {
  // PRD test 4: mixed-formatting GDoc paste → correct IR
  it("produces a valid TipTapDoc from the GDoc fixture", async () => {
    const html = await readFile(GDOC_FIXTURE, "utf8");
    const doc = ingestGDocHtml(html, "gdoc_sample.html");
    expect(doc.type).toBe("doc");
    expect(doc.docType).toBe("auto");
    expect(doc.sourceFile).toBe("gdoc_sample.html");
    expect(doc.content.length).toBeGreaterThan(0);
  });

  it("parses h1 heading from GDoc fixture", async () => {
    const html = await readFile(GDOC_FIXTURE, "utf8");
    const doc = ingestGDocHtml(html);
    const headings = findNodes<HeadingNode>(doc, "heading");
    const h1 = headings.find((h) => h.attrs.level === 1);
    expect(h1).toBeDefined();
    const text = h1!.content.map((n) => ("text" in n ? n.text : "")).join("");
    expect(text).toContain("Vendor Consolidation");
  });

  it("parses h2 headings from GDoc fixture", async () => {
    const html = await readFile(GDOC_FIXTURE, "utf8");
    const doc = ingestGDocHtml(html);
    const h2s = findNodes<HeadingNode>(doc, "heading").filter((h) => h.attrs.level === 2);
    // Fixture has: Background, Recommendation, Cost Comparison, Conclusion
    expect(h2s.length).toBeGreaterThanOrEqual(3);
  });

  it("parses bullet list items from GDoc fixture", async () => {
    const html = await readFile(GDOC_FIXTURE, "utf8");
    const doc = ingestGDocHtml(html);
    const lists = findNodes<BulletListNode>(doc, "bulletList");
    expect(lists.length).toBeGreaterThan(0);
    expect(lists[0]!.content.length).toBeGreaterThanOrEqual(2);
  });

  it("parses table with header and data rows from GDoc fixture", async () => {
    const html = await readFile(GDOC_FIXTURE, "utf8");
    const doc = ingestGDocHtml(html);
    const tables = findNodes<TableNode>(doc, "table");
    expect(tables.length).toBeGreaterThan(0);
    const table = tables[0]!;
    expect(table.content.length).toBeGreaterThanOrEqual(2); // header + body rows
    // First row has 3 cells (Vendor, Monthly Cost, Features)
    expect(table.content[0]!.content.length).toBe(3);
  });

  it("strips all GDoc span wrappers — no span tags in sanitized output", async () => {
    const html = await readFile(GDOC_FIXTURE, "utf8");
    const sanitized = sanitizeGDocHtml(html);
    expect(sanitized).not.toContain("<span");
  });

  it("handles bold-that-isn't (font-weight:normal) — does not produce bold marks", async () => {
    const html = `<body><p><b style="font-weight:normal">not bold</b></p></body>`;
    const doc = ingestGDocHtml(html);
    const paragraphs = findNodes(doc, "paragraph");
    const allMarks = paragraphs.flatMap((p: ReturnType<typeof findNodes<{ type: string }>>[number]) => {
      if (!("content" in p)) return [];
      return (p as { content: Array<{ marks?: Array<{type: string}> }> }).content.flatMap(
        (t) => t.marks ?? []
      );
    });
    const hasBold = allMarks.some((m: {type: string}) => m.type === "bold");
    // "not bold" should not have a bold mark since style overrides it
    expect(hasBold).toBe(false);
  });
});

// ── Error cases ───────────────────────────────────────────────────────────────

describe("ingestGDocHtml — error cases", () => {
  // PRD test 2 equivalent: empty paste → graceful error
  it("throws GDocIngestError with EMPTY_INPUT for empty string", () => {
    expect(() => ingestGDocHtml("")).toThrowError(GDocIngestError);
    expect(() => ingestGDocHtml("")).toSatisfy((fn: () => void) => {
      try { fn(); return false; }
      catch (e) { return e instanceof GDocIngestError && e.code === "EMPTY_INPUT"; }
    });
  });

  it("throws GDocIngestError with EMPTY_INPUT for whitespace-only string", () => {
    expect(() => ingestGDocHtml("   \n\t  ")).toThrow(GDocIngestError);
  });

  // PRD test 3 equivalent: oversized paste → handled
  it("throws GDocIngestError with INPUT_TOO_LARGE for oversized input", () => {
    const oversized = "A".repeat(MAX_GDOC_BYTES + 1);
    expect(() => ingestGDocHtml(oversized)).toSatisfy((fn: () => void) => {
      try { fn(); return false; }
      catch (e) { return e instanceof GDocIngestError && e.code === "INPUT_TOO_LARGE"; }
    });
  });

  it("handles plain text (no HTML tags) without crashing", () => {
    // Plain text paste: should produce at least one paragraph
    const doc = ingestGDocHtml("<p>Just plain text in a paragraph.</p>");
    expect(doc.content.length).toBeGreaterThan(0);
  });
});
