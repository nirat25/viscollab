/**
 * P2-T2 deterministic tests: structural validator (validateContract)
 *
 * PRD P2-T2 test contract:
 *   - structural-equivalence and safety checks run in CI without an LLM
 *   - script/inline-handlers/external-resources/broken-anchors must be caught
 *   - progressive disclosure and heading count are reported as soft signals
 */

import { describe, it, expect } from "vitest";
import { validateContract } from "../../src/convert/template.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_ARTIFACT = `
<article>
  <h1 id="lead">Decision Summary</h1>
  <p>Consolidate analytics vendors onto Vendor A.</p>
  <details>
    <summary>Background</summary>
    <p>Three vendors with overlapping capabilities cost $240k/year.</p>
  </details>
  <h2 id="recommendation">Recommendation</h2>
  <ul>
    <li>Consolidate onto Vendor A</li>
    <li>Migrate dashboards by Q3</li>
  </ul>
  <nav><a href="#lead">Back to top</a> · <a href="#recommendation">Recommendation</a></nav>
</article>
`.trim();

// ── Valid artifact ─────────────────────────────────────────────────────────────

describe("validateContract — valid artifact", () => {
  it("passes a clean, well-formed artifact", () => {
    const result = validateContract(VALID_ARTIFACT);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects progressive disclosure (<details>)", () => {
    const result = validateContract(VALID_ARTIFACT);
    expect(result.progressiveDisclosure).toBe(true);
  });

  it("counts headings correctly", () => {
    const result = validateContract(VALID_ARTIFACT);
    expect(result.headingCount).toBe(2); // h1 + h2
  });

  it("reports no broken anchors when all hrefs resolve", () => {
    const result = validateContract(VALID_ARTIFACT);
    expect(result.brokenAnchors).toHaveLength(0);
  });
});

// ── Hard failure: <script> ────────────────────────────────────────────────────

describe("validateContract — <script> injection", () => {
  it("fails when <script> is present", () => {
    const html = `<p>Hello</p><script>alert('xss')</script>`;
    const result = validateContract(html);
    expect(result.valid).toBe(false);
    expect(result.hasScript).toBe(true);
    expect(result.errors.some((e) => e.includes("script"))).toBe(true);
  });

  it("fails on <script> with src attribute too", () => {
    const html = `<script src="https://evil.example/x.js"></script><p>ok</p>`;
    const result = validateContract(html);
    expect(result.hasScript).toBe(true);
    expect(result.valid).toBe(false);
  });
});

// ── Hard failure: inline event handlers ───────────────────────────────────────

describe("validateContract — inline event handlers", () => {
  it("fails when onclick= is present", () => {
    const html = `<button onclick="doSomething()">Click</button>`;
    const result = validateContract(html);
    expect(result.valid).toBe(false);
    expect(result.hasInlineHandlers).toBe(true);
    expect(result.errors.some((e) => e.includes("on*"))).toBe(true);
  });

  it("fails for onerror= on an img tag", () => {
    const html = `<img src="x" onerror="alert(1)" alt="bad">`;
    const result = validateContract(html);
    expect(result.hasInlineHandlers).toBe(true);
    expect(result.valid).toBe(false);
  });

  it("fails for onload= on body", () => {
    const html = `<div onload="evil()">content</div>`;
    const result = validateContract(html);
    expect(result.hasInlineHandlers).toBe(true);
  });
});

// ── Hard failure: external resources ─────────────────────────────────────────

describe("validateContract — external resources", () => {
  it("fails when an external stylesheet <link> is present", () => {
    const html = `<link rel="stylesheet" href="https://cdn.example.com/style.css"><p>text</p>`;
    const result = validateContract(html);
    expect(result.valid).toBe(false);
    expect(result.hasExternalResources).toBe(true);
    expect(result.errors.some((e) => e.includes("external"))).toBe(true);
  });

  it("fails when an <iframe> is present", () => {
    const html = `<iframe src="https://example.com"></iframe><p>text</p>`;
    const result = validateContract(html);
    expect(result.hasExternalResources).toBe(true);
    expect(result.valid).toBe(false);
  });

  it("fails when an <object> is present", () => {
    const html = `<object data="something.swf"></object><p>text</p>`;
    const result = validateContract(html);
    expect(result.hasExternalResources).toBe(true);
    expect(result.valid).toBe(false);
  });
});

// ── Hard failure: broken anchors ─────────────────────────────────────────────

describe("validateContract — broken anchors", () => {
  it("fails when an internal anchor href points to a missing id", () => {
    const html = `<p><a href="#missing">Go</a></p><p id="present">Here</p>`;
    const result = validateContract(html);
    expect(result.valid).toBe(false);
    expect(result.brokenAnchors).toContain("missing");
    expect(result.errors.some((e) => e.includes("broken"))).toBe(true);
  });

  it("passes when all internal anchors resolve", () => {
    const html = `<p id="section-a">Content</p><a href="#section-a">Go</a>`;
    const result = validateContract(html);
    expect(result.brokenAnchors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it("ignores external hrefs (http://)", () => {
    const html = `<p><a href="https://example.com">External</a></p>`;
    const result = validateContract(html);
    expect(result.brokenAnchors).toHaveLength(0);
  });
});

// ── Soft signals ──────────────────────────────────────────────────────────────

describe("validateContract — soft signals", () => {
  it("detects aria-expanded as progressive disclosure", () => {
    const html = `<div aria-expanded="false">content</div>`;
    const result = validateContract(html);
    expect(result.progressiveDisclosure).toBe(true);
  });

  it("reports zero headings when none are present", () => {
    const html = `<p>No headings here.</p>`;
    const result = validateContract(html);
    expect(result.headingCount).toBe(0);
  });

  it("counts all heading levels h1–h6", () => {
    const html = `<h1>One</h1><h2>Two</h2><h3>Three</h3>`;
    const result = validateContract(html);
    expect(result.headingCount).toBe(3);
  });

  it("reports no progressive disclosure for plain markup", () => {
    const html = `<h1>Title</h1><p>Body</p>`;
    const result = validateContract(html);
    expect(result.progressiveDisclosure).toBe(false);
  });
});

// ── Multiple violations ───────────────────────────────────────────────────────

describe("validateContract — multiple violations", () => {
  it("reports all hard failures simultaneously", () => {
    const html = `<script>x()</script><button onclick="y()">B</button><a href="#ghost">Link</a>`;
    const result = validateContract(html);
    expect(result.valid).toBe(false);
    expect(result.hasScript).toBe(true);
    expect(result.hasInlineHandlers).toBe(true);
    expect(result.brokenAnchors).toContain("ghost");
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
