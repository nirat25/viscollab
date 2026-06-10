/**
 * P2-T2 deterministic tests: ir-to-text serialiser
 *
 * Verifies that TipTap IR nodes are serialised to the correct Markdown-flavoured
 * prompt text. No LLM calls.
 */

import { describe, it, expect } from "vitest";
import { tipTapDocToPromptText } from "../../src/convert/ir-to-text.js";
import type { TipTapDoc } from "../../src/ir.js";

function makeDoc(content: TipTapDoc["content"]): TipTapDoc {
  return { type: "doc", sourceFile: "test.docx", docType: "auto", content };
}

describe("tipTapDocToPromptText", () => {
  it("serialises a heading with level prefix", () => {
    const doc = makeDoc([
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
    ]);
    expect(tipTapDocToPromptText(doc)).toBe("# Title");
  });

  it("serialises h2 with ## prefix", () => {
    const doc = makeDoc([
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Section" }] },
    ]);
    expect(tipTapDocToPromptText(doc)).toBe("## Section");
  });

  it("serialises a paragraph as plain text", () => {
    const doc = makeDoc([
      {
        type: "paragraph",
        attrs: {},
        content: [{ type: "text", text: "Hello world" }],
      },
    ]);
    expect(tipTapDocToPromptText(doc)).toBe("Hello world");
  });

  it("serialises bold inline mark as **text**", () => {
    const doc = makeDoc([
      {
        type: "paragraph",
        attrs: {},
        content: [
          { type: "text", text: "normal " },
          { type: "text", text: "bold", marks: [{ type: "bold" }] },
        ],
      },
    ]);
    expect(tipTapDocToPromptText(doc)).toBe("normal **bold**");
  });

  it("serialises italic inline mark as _text_", () => {
    const doc = makeDoc([
      {
        type: "paragraph",
        attrs: {},
        content: [{ type: "text", text: "em", marks: [{ type: "italic" }] }],
      },
    ]);
    expect(tipTapDocToPromptText(doc)).toBe("_em_");
  });

  it("serialises code inline mark as `text`", () => {
    const doc = makeDoc([
      {
        type: "paragraph",
        attrs: {},
        content: [{ type: "text", text: "fn()", marks: [{ type: "code" }] }],
      },
    ]);
    expect(tipTapDocToPromptText(doc)).toContain("`fn()`");
  });

  it("serialises link mark as [text](href)", () => {
    const doc = makeDoc([
      {
        type: "paragraph",
        attrs: {},
        content: [
          {
            type: "text",
            text: "click",
            marks: [{ type: "link", attrs: { href: "https://example.com" } }],
          },
        ],
      },
    ]);
    expect(tipTapDocToPromptText(doc)).toBe("[click](https://example.com)");
  });

  it("serialises a bullet list with - prefix", () => {
    const doc = makeDoc([
      {
        type: "bulletList",
        attrs: {},
        content: [
          {
            type: "listItem",
            attrs: {},
            content: [{ type: "paragraph", attrs: {}, content: [{ type: "text", text: "Alpha" }] }],
          },
          {
            type: "listItem",
            attrs: {},
            content: [{ type: "paragraph", attrs: {}, content: [{ type: "text", text: "Beta" }] }],
          },
        ],
      },
    ]);
    const out = tipTapDocToPromptText(doc);
    expect(out).toContain("- Alpha");
    expect(out).toContain("- Beta");
  });

  it("serialises an ordered list with 1. 2. prefixes", () => {
    const doc = makeDoc([
      {
        type: "orderedList",
        attrs: { start: 1 },
        content: [
          {
            type: "listItem",
            attrs: {},
            content: [{ type: "paragraph", attrs: {}, content: [{ type: "text", text: "First" }] }],
          },
          {
            type: "listItem",
            attrs: {},
            content: [{ type: "paragraph", attrs: {}, content: [{ type: "text", text: "Second" }] }],
          },
        ],
      },
    ]);
    const out = tipTapDocToPromptText(doc);
    expect(out).toContain("1. First");
    expect(out).toContain("2. Second");
  });

  it("serialises a table as a pipe table with header separator", () => {
    const doc = makeDoc([
      {
        type: "table",
        attrs: {},
        content: [
          {
            type: "tableRow",
            attrs: {},
            content: [
              { type: "tableHeader", attrs: {}, content: [{ type: "paragraph", attrs: {}, content: [{ type: "text", text: "Name" }] }] },
              { type: "tableHeader", attrs: {}, content: [{ type: "paragraph", attrs: {}, content: [{ type: "text", text: "Value" }] }] },
            ],
          },
          {
            type: "tableRow",
            attrs: {},
            content: [
              { type: "tableCell", attrs: {}, content: [{ type: "paragraph", attrs: {}, content: [{ type: "text", text: "A" }] }] },
              { type: "tableCell", attrs: {}, content: [{ type: "paragraph", attrs: {}, content: [{ type: "text", text: "1" }] }] },
            ],
          },
        ],
      },
    ]);
    const out = tipTapDocToPromptText(doc);
    expect(out).toContain("| Name | Value |");
    expect(out).toContain("| --- | --- |");
    expect(out).toContain("| A | 1 |");
  });

  it("serialises an image as a placeholder", () => {
    const doc = makeDoc([
      { type: "image", attrs: { src: "data:image/png;base64,...", alt: "Chart", title: undefined } },
    ]);
    expect(tipTapDocToPromptText(doc)).toContain("[Image: Chart]");
  });

  it("separates blocks with double newlines", () => {
    const doc = makeDoc([
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
      { type: "paragraph", attrs: {}, content: [{ type: "text", text: "Body" }] },
    ]);
    const out = tipTapDocToPromptText(doc);
    expect(out).toBe("# Title\n\nBody");
  });

  it("skips empty blocks (whitespace-only paragraphs)", () => {
    const doc = makeDoc([
      { type: "paragraph", attrs: {}, content: [{ type: "text", text: "   " }] },
      { type: "paragraph", attrs: {}, content: [{ type: "text", text: "Real" }] },
    ]);
    const out = tipTapDocToPromptText(doc);
    expect(out).toBe("Real");
  });
});
