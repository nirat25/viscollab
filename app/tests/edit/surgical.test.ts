import { vi, describe, it, expect } from "vitest";
import {
  performDirectHtmlEdit,
  performSurgicalEdit,
  AmbiguityError,
  validateHtmlSanity,
  verifyContainment
} from "../../src/edit/surgical.js";
import * as client from "../../src/convert/client.js";

// Mock the complete function
vi.mock("../../src/convert/client.js", () => {
  return {
    complete: vi.fn(),
    getModel: vi.fn(),
    providerInfo: vi.fn(),
  };
});

describe("Surgical Edit Loop", () => {
  const baseHtml = `
<div id="doc">
  <section id="sec-1">
    <h2>Introduction</h2>
    <p>This is the introductory section.</p>
    <details><summary>More detail</summary><p>Detailed info.</p></details>
  </section>
  <section id="sec-2">
    <h2>Details Table</h2>
    <table>
      <tr><th>Item</th><th>Value</th></tr>
      <tr><td>Item A</td><td>100</td></tr>
    </table>
  </section>
  <section id="sec-3">
    <h2>Lists Section</h2>
    <ul id="list-1">
      <li>First point</li>
      <li>Second point</li>
    </ul>
  </section>
</div>
  `.trim();

  describe("HTML Validation & Sanitization", () => {
    it("should accept safe, well-formed HTML", () => {
      const safeHtml = `<section id="sec-1"><h2>Hello</h2><details><summary>Summary</summary>Content</details></section>`;
      expect(() => validateHtmlSanity(safeHtml)).not.toThrow();
    });

    it("should reject unbalanced angle brackets", () => {
      const badHtml = `<section id="sec-1"<h2>Hello</h2></section>`;
      expect(() => validateHtmlSanity(badHtml)).toThrow("balanced angle brackets");
    });

    it("should reject unclosed tags", () => {
      const badHtml = `<section id="sec-1"><h2>Hello</h2>`;
      expect(() => validateHtmlSanity(badHtml)).toThrow("unclosed tags");
    });

    it("should reject mismatched tags", () => {
      const badHtml = `<section id="sec-1"><h2>Hello</h3></section>`;
      expect(() => validateHtmlSanity(badHtml)).toThrow("mismatched tags");
    });

    it("should reject script tags", () => {
      const badHtml = `<section id="sec-1"><script>alert('hack')</script></section>`;
      expect(() => validateHtmlSanity(badHtml)).toThrow("Unsafe HTML: contains <script>");
    });

    it("should reject inline event handlers", () => {
      const badHtml = `<section id="sec-1"><button onclick="alert('hack')">Click</button></section>`;
      expect(() => validateHtmlSanity(badHtml)).toThrow("Unsafe HTML: contains inline event handlers");
    });

    it("should reject forbidden layout-breaking elements", () => {
      const badHtml1 = `<section id="sec-1"><iframe></iframe></section>`;
      expect(() => validateHtmlSanity(badHtml1)).toThrow("Unsafe HTML: forbidden layout-breaking or external element");

      const badHtml2 = `<section id="sec-1"><link rel="stylesheet" href="style.css"></section>`;
      expect(() => validateHtmlSanity(badHtml2)).toThrow("Unsafe HTML: forbidden layout-breaking or external element");
    });
  });

  describe("Progressive Disclosure Checks", () => {
    it("should reject direct edits that remove all progressive disclosure", () => {
      const newSec1 = `<section id="sec-1"><h2>No more details</h2><p>Flat text</p></section>`;
      expect(() => performDirectHtmlEdit(baseHtml, "sec-1", newSec1)).toThrow("Progressive disclosure checks violated");
    });

    it("should reject details elements that are open by default", () => {
      const newSec1 = `
<section id="sec-1">
  <h2>Details open by default</h2>
  <details open>
    <summary>Summary</summary>
    <p>This details block starts open</p>
  </details>
</section>
      `.trim();
      expect(() => performDirectHtmlEdit(baseHtml, "sec-1", newSec1)).toThrow("Progressive disclosure checks violated");
    });
  });

  describe("Containment Verification", () => {
    it("should successfully verify containment when edit is isolated", () => {
      const newSec1 = `
<section id="sec-1">
  <h2>Introduction</h2>
  <p>Updated introductory section.</p>
  <details><summary>More detail</summary><p>Detailed info.</p></details>
</section>
      `.trim();
      const updated = performDirectHtmlEdit(baseHtml, "sec-1", newSec1);
      expect(verifyContainment(baseHtml, updated, "sec-1")).toBe(true);
    });

    it("should throw if outside elements are mutated", () => {
      const malformedNewSec1 = `
<section id="sec-1">
  <h2>Introduction</h2>
  <details><summary>More detail</summary><p>Detailed info.</p></details>
</section>
<div id="unwanted-leak">Leaked edit</div>
      `.trim();
      
      expect(() => performDirectHtmlEdit(baseHtml, "sec-1", malformedNewSec1)).toThrow("Containment check failed");
    });
  });

  describe("Sequence-based Concurrency", () => {
    it("should throw conflict error if sequence mismatch", () => {
      const newSec1 = `<section id="sec-1"><h2>Hello</h2><details><summary>Summary</summary>Content</details></section>`;
      expect(() => performDirectHtmlEdit(baseHtml, "sec-1", newSec1, 2, 1)).toThrow("Concurrency conflict: sequence mismatch");
    });

    it("should proceed if sequence matches", () => {
      const newSec1 = `<section id="sec-1"><h2>Hello</h2><details><summary>Summary</summary>Content</details></section>`;
      expect(() => performDirectHtmlEdit(baseHtml, "sec-1", newSec1, 1, 1)).not.toThrow();
    });
  });

  describe("Ambiguity Resolution", () => {
    it("should throw AmbiguityError if instruction targets multiple lists", async () => {
      const doubleListHtml = `
<div id="doc">
  <section id="sec-3">
    <h2>Lists Section</h2>
    <ul id="list-1"><li>Item 1</li></ul>
    <ul id="list-2"><li>Item 2</li></ul>
    <details><summary>Expand</summary>Ok</details>
  </section>
</div>
      `.trim();

      await expect(
        performSurgicalEdit(doubleListHtml, "sec-3", "Make the list shorter")
      ).rejects.toThrow(AmbiguityError);
    });

    it("should throw AmbiguityError if instruction targets multiple tables", async () => {
      const doubleTableHtml = `
<div id="doc">
  <section id="sec-2">
    <h2>Tables Section</h2>
    <table><tr><th>Table 1</th></tr></table>
    <table><tr><th>Table 2</th></tr></table>
    <details><summary>Expand</summary>Ok</details>
  </section>
</div>
      `.trim();

      await expect(
        performSurgicalEdit(doubleTableHtml, "sec-2", "Add row to the table")
      ).rejects.toThrow(AmbiguityError);
    });
  });

  describe("Surgical Edit LLM Loop", () => {
    it("should extract targeted section, call LLM, and splice it back correctly", async () => {
      const mockedComplete = vi.mocked(client.complete);
      mockedComplete.mockResolvedValue(`
<section id="sec-1">
  <h2>Introduction</h2>
  <p>Perfect intro.</p>
  <details><summary>More detail</summary><p>Detailed info.</p></details>
</section>
      `);

      const updated = await performSurgicalEdit(baseHtml, "sec-1", "Make the intro sound perfect");
      
      expect(mockedComplete).toHaveBeenCalledWith(expect.objectContaining({
        role: "edit",
        system: expect.stringContaining("ONLY the provided HTML section"),
        user: expect.stringContaining("This is the introductory section.")
      }));
      
      expect(updated).toContain("Perfect intro.");
      expect(updated).toContain("sec-2");
      expect(updated).toContain("sec-3");
      expect(verifyContainment(baseHtml, updated, "sec-1")).toBe(true);
    });
  });
});
