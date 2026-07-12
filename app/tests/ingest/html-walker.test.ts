/**
 * Regression tests for two html-walker ingestion bugs found during SEM-004
 * fixture work (2026-07-12):
 *
 *  1. HTML entities left encoded: node-html-parser's `.rawText` does not decode
 *     entities, so `&`/`'`/`"` in source markdown survived into IR plain text as
 *     `&amp;` / `&#39;` / `&quot;`. Fixed by reading the `.text` accessor.
 *  2. makeListItem mixed-children duplication: a direct text-node child of <li>
 *     re-walked the ENTIRE <li> (inlineContent(el) instead of the child),
 *     duplicating formatted siblings for markdown like `- **Label**: rest`.
 *
 * Deterministic: md → marked → ingestRawHtml → nodeToPlainText, no LLM, no keys.
 */

import { describe, it, expect } from "vitest";
import { marked } from "marked";
import { ingestRawHtml } from "../../src/ingest/index.js";
import { nodeToPlainText } from "../../src/ir.js";
import type { BulletListNode, ParagraphNode, TextNode } from "../../src/ir.js";

async function ingestMd(md: string) {
  const html = await marked.parse(md);
  return ingestRawHtml(html, "test.md");
}

describe("html-walker entity decoding (bug 1)", () => {
  it("decodes &amp; / apostrophes / quotes in paragraphs and headings", async () => {
    const md = [
      "# Ampersands & Apostrophes",
      "",
      'The company\'s "flagship" product — R&D costs & more.',
    ].join("\n");
    const doc = await ingestMd(md);
    const text = nodeToPlainText(doc);

    expect(text).toContain("Ampersands & Apostrophes");
    expect(text).toContain('The company\'s "flagship" product');
    expect(text).toContain("R&D costs & more");
    expect(text).not.toContain("&amp;");
    expect(text).not.toContain("&#39;");
    expect(text).not.toContain("&quot;");
  });

  it("decodes entities inside list items and bold runs", async () => {
    const md = "- Smith & Sons won't renew\n- **Q&A**: what's next?";
    const doc = await ingestMd(md);
    const text = nodeToPlainText(doc);

    expect(text).toContain("Smith & Sons won't renew");
    expect(text).toContain("Q&A");
    expect(text).toContain("what's next?");
    expect(text).not.toMatch(/&amp;|&#39;|&quot;/);
  });

  it("preserves literal angle-bracket text as text (decoded, not markup)", async () => {
    const md = "Use `a < b` and a\\&b in prose.";
    const doc = await ingestMd(md);
    const text = nodeToPlainText(doc);
    expect(text).toContain("a < b");
    expect(text).toContain("a&b");
    expect(text).not.toContain("&lt;");
  });
});

describe("makeListItem mixed-children duplication (bug 2)", () => {
  it("does not duplicate a bold label followed by plain text in a bullet", async () => {
    const md = "- **Customer churn risk**: largest accounts may leave.";
    const doc = await ingestMd(md);
    const text = nodeToPlainText(doc);

    // Exactly one occurrence of the label — the bug produced two.
    const occurrences = text.split("Customer churn risk").length - 1;
    expect(occurrences).toBe(1);
    expect(text).toContain("Customer churn risk");
    expect(text).toContain(": largest accounts may leave.");
  });

  it("keeps marks and order intact for mixed inline content in a bullet", async () => {
    const md = "- **Label**: middle _em_ end";
    const doc = await ingestMd(md);

    const list = doc.content.find((n): n is BulletListNode => n.type === "bulletList");
    expect(list).toBeDefined();
    const para = list!.content[0]!.content.find(
      (n): n is ParagraphNode => n.type === "paragraph"
    );
    expect(para).toBeDefined();

    const runs = para!.content.filter((n): n is TextNode => n.type === "text");
    const joined = runs.map((r) => r.text).join("");
    expect(joined).toBe("Label: middle em end");

    const bold = runs.find((r) => r.marks?.some((m) => m.type === "bold"));
    expect(bold?.text).toBe("Label");
    const italic = runs.find((r) => r.marks?.some((m) => m.type === "italic"));
    expect(italic?.text).toBe("em");
  });

  it("does not duplicate parent text into nested list items", async () => {
    const md = ["- **Parent** item", "  - child one", "  - child two"].join("\n");
    const doc = await ingestMd(md);
    const text = nodeToPlainText(doc);

    expect(text.split("Parent").length - 1).toBe(1);
    expect(text.split("child one").length - 1).toBe(1);
    expect(text.split("child two").length - 1).toBe(1);
  });

  it("preserves spacing between adjacent inline elements in a bullet", async () => {
    const md = "- **bold** _italic_";
    const doc = await ingestMd(md);
    // nodeToPlainText joins inline runs with "\n" (pre-existing behavior);
    // normalize whitespace the way sourceTrace/comments do before asserting.
    const text = nodeToPlainText(doc).replace(/\s+/g, " ");
    expect(text).toContain("bold italic"); // not "bolditalic"

    // The IR itself must keep the separating whitespace run.
    const list = doc.content.find((n): n is BulletListNode => n.type === "bulletList");
    const para = list!.content[0]!.content.find(
      (n): n is ParagraphNode => n.type === "paragraph"
    );
    const joined = para!.content
      .filter((n): n is TextNode => n.type === "text")
      .map((r) => r.text)
      .join("");
    expect(joined).toBe("bold italic");
  });
});
