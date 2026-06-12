import { describe, it, expect } from "vitest";
import {
  validateEditRequest,
  validateLlmSectionResult,
  simulateEdit,
} from "../../src/edit/editEndpointHelpers.js";

// ---------------------------------------------------------------------------
// validateEditRequest
// ---------------------------------------------------------------------------
describe("validateEditRequest", () => {
  const valid = {
    documentId: "doc-1",
    sectionId: "section-intro",
    sectionHtml: '<section id="section-intro"><p>Hello world.</p></section>',
    instruction: "Make it more concise",
  };

  it("returns no errors for a valid request", () => {
    expect(validateEditRequest(valid)).toHaveLength(0);
  });

  it("returns error when documentId is missing", () => {
    const errs = validateEditRequest({ ...valid, documentId: undefined });
    expect(errs.some((e) => e.field === "documentId")).toBe(true);
  });

  it("returns error when documentId is empty string", () => {
    const errs = validateEditRequest({ ...valid, documentId: "   " });
    expect(errs.some((e) => e.field === "documentId")).toBe(true);
  });

  it("returns error when sectionId is missing", () => {
    const errs = validateEditRequest({ ...valid, sectionId: undefined });
    expect(errs.some((e) => e.field === "sectionId")).toBe(true);
  });

  it("returns error when sectionHtml is missing", () => {
    const errs = validateEditRequest({ ...valid, sectionHtml: undefined });
    expect(errs.some((e) => e.field === "sectionHtml")).toBe(true);
  });

  it("returns error when sectionHtml exceeds 100 KB", () => {
    const bigHtml = "x".repeat(101 * 1024);
    const errs = validateEditRequest({ ...valid, sectionHtml: bigHtml });
    expect(errs.some((e) => e.field === "sectionHtml" && e.message.includes("100 KB"))).toBe(true);
  });

  it("accepts sectionHtml exactly at 100 KB limit", () => {
    // Build an HTML string that's exactly 100 * 1024 bytes with id present
    const prefix = `<section id="section-intro">`;
    const suffix = `</section>`;
    const filler = "a".repeat(100 * 1024 - prefix.length - suffix.length);
    const borderHtml = prefix + filler + suffix;
    expect(Buffer.byteLength(borderHtml, "utf8")).toBe(100 * 1024);
    const errs = validateEditRequest({ ...valid, sectionHtml: borderHtml });
    expect(errs.some((e) => e.field === "sectionHtml")).toBe(false);
  });

  it("returns error when instruction is missing", () => {
    const errs = validateEditRequest({ ...valid, instruction: undefined });
    expect(errs.some((e) => e.field === "instruction")).toBe(true);
  });

  it("returns multiple errors when several fields missing", () => {
    const errs = validateEditRequest({});
    expect(errs.length).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// validateLlmSectionResult — containment contract
// ---------------------------------------------------------------------------
describe("validateLlmSectionResult", () => {
  it("returns null when root element has the required id", () => {
    const html = `<section id="intro"><p>Updated.</p></section>`;
    expect(validateLlmSectionResult(html, "intro")).toBeNull();
  });

  it("returns null when a nested element has the required id (getElementById traversal)", () => {
    // node-html-parser getElementById searches descendants too
    const html = `<div><section id="intro"><p>Updated.</p></section></div>`;
    expect(validateLlmSectionResult(html, "intro")).toBeNull();
  });

  it("returns error when no element has the required id", () => {
    const html = `<section id="wrong-id"><p>Updated.</p></section>`;
    const result = validateLlmSectionResult(html, "intro");
    expect(result).not.toBeNull();
    expect(result).toContain("intro");
  });

  it("returns error for empty string", () => {
    expect(validateLlmSectionResult("", "intro")).not.toBeNull();
  });

  it("returns error for whitespace-only string", () => {
    expect(validateLlmSectionResult("   ", "intro")).not.toBeNull();
  });

  it("returns error for plain text with no elements", () => {
    const result = validateLlmSectionResult("just some text", "intro");
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// simulateEdit — simulation fallback
// ---------------------------------------------------------------------------
describe("simulateEdit", () => {
  const sectionId = "sec-actions";
  const baseHtml = `<div id="sec-actions"><p>First sentence. Second sentence. Third sentence.</p><p>Another paragraph here.</p></div>`;

  it("preserves the sectionId on the root element after simulation", () => {
    const result = simulateEdit(baseHtml, sectionId, "do something");
    expect(result).toContain(`id="${sectionId}"`);
  });

  it("appends simulation notice for a generic instruction", () => {
    const result = simulateEdit(baseHtml, sectionId, "rewrite this section");
    expect(result).toContain("Simulated edit");
    expect(result).toContain("rewrite this section");
    expect(result).toContain("ANTHROPIC_API_KEY");
  });

  it("trims paragraphs to first sentence for 'concise' instruction", () => {
    const result = simulateEdit(baseHtml, sectionId, "make it concise");
    // Should retain first sentence but drop the second
    expect(result).toContain("First sentence.");
    expect(result).not.toContain("Second sentence.");
  });

  it("trims paragraphs to first sentence for 'shorten' instruction", () => {
    const result = simulateEdit(baseHtml, sectionId, "shorten this");
    expect(result).toContain("First sentence.");
    expect(result).not.toContain("Second sentence.");
  });

  it("trims paragraphs to first sentence for 'brief' instruction", () => {
    const result = simulateEdit(baseHtml, sectionId, "be brief");
    expect(result).toContain("First sentence.");
    expect(result).not.toContain("Second sentence.");
  });

  it("escapes HTML special chars in the instruction in the notice", () => {
    const result = simulateEdit(baseHtml, sectionId, `use <b>bold</b> & "quotes"`);
    expect(result).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(result).toContain("&amp;");
    expect(result).toContain("&quot;quotes&quot;");
  });

  it("does not reference any hardcoded section id in the output", () => {
    const result = simulateEdit(baseHtml, "my-dynamic-id", "fix grammar");
    // Should use whatever sectionId was passed, not a hardcoded one
    expect(result).toContain(`id="my-dynamic-id"`);
  });

  it("handles sectionHtml where root element lacks the id (adds it)", () => {
    const noIdHtml = `<div><p>Some text here.</p></div>`;
    const result = simulateEdit(noIdHtml, "added-id", "edit this");
    expect(result).toContain(`id="added-id"`);
  });

  it("concise simulation does nothing destructive to non-p content", () => {
    const withList = `<section id="s1"><p>Only sentence.</p><ul><li>Item 1</li><li>Item 2</li></ul></section>`;
    const result = simulateEdit(withList, "s1", "concise");
    // List should still be there
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>Item 1</li>");
  });
});
