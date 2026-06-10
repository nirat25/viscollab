/**
 * P2-T2 deterministic tests: convert module (stripFences, buildPrompt)
 *
 * Tests for the deterministic parts of convert.ts that don't require LLM calls.
 * LLM-dependent behaviour (fidelity) is covered by the eval harness (PRD §12B).
 */

import { describe, it, expect } from "vitest";
import { stripFences, buildPrompt, PROMPT_VERSION } from "../../src/convert/convert.js";
import type { TipTapDoc } from "../../src/ir.js";

function makeDoc(text: string): TipTapDoc {
  return {
    type: "doc",
    sourceFile: "test.docx",
    docType: "auto",
    content: [
      {
        type: "paragraph",
        attrs: {},
        content: [{ type: "text", text }],
      },
    ],
  };
}

// ── stripFences ───────────────────────────────────────────────────────────────

describe("stripFences", () => {
  it("leaves clean HTML untouched", () => {
    const html = "<p>Hello world</p>";
    expect(stripFences(html)).toBe(html);
  });

  it("strips ```html ... ``` fences", () => {
    const html = "```html\n<p>Hello</p>\n```";
    expect(stripFences(html)).toBe("<p>Hello</p>");
  });

  it("strips ``` ... ``` fences without html language tag", () => {
    const html = "```\n<p>Hello</p>\n```";
    expect(stripFences(html)).toBe("<p>Hello</p>");
  });

  it("strips fences case-insensitively (```HTML)", () => {
    const html = "```HTML\n<p>Hello</p>\n```";
    expect(stripFences(html)).toBe("<p>Hello</p>");
  });

  it("trims leading/trailing whitespace", () => {
    const html = "  \n<p>Hello</p>\n  ";
    expect(stripFences(html)).toBe("<p>Hello</p>");
  });

  it("handles multi-line HTML inside fences", () => {
    const html = "```html\n<article>\n  <h1>Title</h1>\n  <p>Body</p>\n</article>\n```";
    const result = stripFences(html);
    expect(result).toContain("<article>");
    expect(result).toContain("</article>");
    expect(result).not.toContain("```");
  });

  it("does not corrupt HTML that starts with a backtick text node", () => {
    // Edge case: HTML that happens to contain backtick text
    const html = "<p>Use `code` here</p>";
    expect(stripFences(html)).toBe(html);
  });
});

// ── buildPrompt ───────────────────────────────────────────────────────────────

describe("buildPrompt", () => {
  it("includes the source document text in the prompt", () => {
    const doc = makeDoc("The main recommendation is to consolidate vendors.");
    const prompt = buildPrompt(doc);
    expect(prompt).toContain("The main recommendation is to consolidate vendors.");
  });

  it("includes instructions to judge the document type first", () => {
    const doc = makeDoc("Some content.");
    const prompt = buildPrompt(doc);
    expect(prompt.toLowerCase()).toContain("judge");
  });

  it("includes the SOURCE DOCUMENT section header", () => {
    const doc = makeDoc("Content.");
    const prompt = buildPrompt(doc);
    expect(prompt).toContain("SOURCE DOCUMENT");
  });

  it("includes the delimiter --- around the source content", () => {
    const doc = makeDoc("Content.");
    const prompt = buildPrompt(doc);
    expect(prompt).toContain("---");
  });

  it("serialises a multi-block document with all blocks in order", () => {
    const doc: TipTapDoc = {
      type: "doc",
      sourceFile: "test.docx",
      docType: "auto",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Decision" }] },
        { type: "paragraph", attrs: {}, content: [{ type: "text", text: "The recommendation." }] },
      ],
    };
    const prompt = buildPrompt(doc);
    // heading appears before paragraph
    const headingIdx = prompt.indexOf("# Decision");
    const paraIdx = prompt.indexOf("The recommendation.");
    expect(headingIdx).toBeGreaterThan(-1);
    expect(paraIdx).toBeGreaterThan(-1);
    expect(headingIdx).toBeLessThan(paraIdx);
  });
});

// ── PROMPT_VERSION ────────────────────────────────────────────────────────────

describe("PROMPT_VERSION", () => {
  it("is a non-empty string", () => {
    expect(PROMPT_VERSION).toBeTruthy();
    expect(typeof PROMPT_VERSION).toBe("string");
  });

  it("follows the conv-vN-descriptor pattern", () => {
    // PRD: version is bumped on any prompt change, attributable in eval results
    expect(PROMPT_VERSION).toMatch(/^conv-v\d+/);
  });
});
