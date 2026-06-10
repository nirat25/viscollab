/**
 * P2-T3 unit tests: validateDisclosure() deterministic checks
 *
 * Tests the static structural validator without a browser.
 * Complements the Playwright tests that verify live DOM behaviour.
 */

import { describe, it, expect } from "vitest";
import { validateDisclosure } from "../../src/render/renderer.js";

// ── Complete valid artifact ────────────────────────────────────────────────────

const VALID_ARTIFACT = `
<div id="top">
  <div id="bluf"><p>Decision: Consolidate onto Vendor A — saves $120k/year.</p></div>
  <nav>
    <a href="#background">Background</a>
    <a href="#conclusion">Conclusion</a>
    <a href="#top">Top</a>
  </nav>
  <details id="background">
    <summary id="background-summary">Background</summary>
    <div class="body"><p>Three vendors with overlapping capabilities.</p></div>
  </details>
  <details id="conclusion">
    <summary id="conclusion-summary">Conclusion</summary>
    <div class="body"><p>Consolidation saves $120k.</p></div>
  </details>
</div>
`.trim();

describe("validateDisclosure — valid artifact", () => {
  it("valid=true for a complete well-formed artifact", () => {
    const r = validateDisclosure(VALID_ARTIFACT);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("allAnchorsResolve=true when all hrefs have matching ids", () => {
    const r = validateDisclosure(VALID_ARTIFACT);
    expect(r.allAnchorsResolve).toBe(true);
    expect(r.brokenAnchors).toHaveLength(0);
  });

  it("hasNavLinks=true with internal anchor navigation", () => {
    const r = validateDisclosure(VALID_ARTIFACT);
    expect(r.hasNavLinks).toBe(true);
    expect(r.navLinkCount).toBe(3);
  });

  it("hasProgressiveDisclosure=true with <details> elements", () => {
    const r = validateDisclosure(VALID_ARTIFACT);
    expect(r.hasProgressiveDisclosure).toBe(true);
    expect(r.detailsCount).toBe(2);
  });

  it("allDetailsDefaultClosed=true when no <details> has open attribute", () => {
    const r = validateDisclosure(VALID_ARTIFACT);
    expect(r.allDetailsDefaultClosed).toBe(true);
    expect(r.openDetailsSummaries).toHaveLength(0);
  });

  it("summaryKeyboardAccessible=true when all summaries are inside details", () => {
    const r = validateDisclosure(VALID_ARTIFACT);
    expect(r.summaryKeyboardAccessible).toBe(true);
    expect(r.summaryCount).toBe(2);
  });
});

// ── DoD #1: broken anchors ────────────────────────────────────────────────────

describe("validateDisclosure — broken anchors", () => {
  it("valid=false when an href=#id has no matching element", () => {
    const html = `<a href="#ghost">Link</a><div id="real">Real</div>`;
    const r = validateDisclosure(html);
    expect(r.valid).toBe(false);
    expect(r.allAnchorsResolve).toBe(false);
    expect(r.brokenAnchors).toContain("ghost");
    expect(r.errors.some((e) => e.includes("ghost"))).toBe(true);
  });

  it("passes when the same id is used for both nav and target", () => {
    const html = `<a href="#sec">Go</a><section id="sec">Content</section>`;
    const r = validateDisclosure(html);
    expect(r.brokenAnchors).toHaveLength(0);
  });

  it("ignores external hrefs (https://)", () => {
    const html = `
      <a href="https://example.com">External</a>
      <details><summary>S</summary><p>Body</p></details>
    `;
    const r = validateDisclosure(html);
    expect(r.brokenAnchors).toHaveLength(0);
  });
});

// ── DoD #3: no progressive disclosure ────────────────────────────────────────

describe("validateDisclosure — missing progressive disclosure", () => {
  it("valid=false when no <details> elements exist", () => {
    const html = `<p>No disclosure here.</p><a href="#sec">Nav</a><div id="sec">Section</div>`;
    const r = validateDisclosure(html);
    expect(r.valid).toBe(false);
    expect(r.hasProgressiveDisclosure).toBe(false);
    expect(r.detailsCount).toBe(0);
    expect(r.errors.some((e) => e.includes("<details>"))).toBe(true);
  });
});

// ── DoD #4: open by default ───────────────────────────────────────────────────

describe("validateDisclosure — details open by default", () => {
  it("valid=false when a <details> has the open attribute", () => {
    const html = `
      <details open id="d1">
        <summary>Section A</summary>
        <p>Content</p>
      </details>
      <a href="#d1">Nav</a>
    `;
    const r = validateDisclosure(html);
    expect(r.valid).toBe(false);
    expect(r.allDetailsDefaultClosed).toBe(false);
    expect(r.openDetailsSummaries).toContain("Section A");
    expect(r.errors.some((e) => e.includes("Section A"))).toBe(true);
  });

  it("reports only the open details, not the closed ones", () => {
    const html = `
      <details open id="d1"><summary>Open</summary><p>body</p></details>
      <details id="d2"><summary>Closed</summary><p>body</p></details>
      <a href="#d1">Nav1</a><a href="#d2">Nav2</a>
    `;
    const r = validateDisclosure(html);
    expect(r.openDetailsSummaries).toContain("Open");
    expect(r.openDetailsSummaries).not.toContain("Closed");
  });
});

// ── DoD #2: no nav links ──────────────────────────────────────────────────────

describe("validateDisclosure — no nav links", () => {
  it("warns (not fails) when there are no nav links", () => {
    const html = `
      <p>No nav.</p>
      <details><summary>Section</summary><p>Body</p></details>
    `;
    const r = validateDisclosure(html);
    // No nav links is a WARNING, not a hard failure
    expect(r.hasNavLinks).toBe(false);
    // Should still be valid (it's a soft signal, not a hard DoD requirement)
    expect(r.warnings.some((w) => w.includes("navigation"))).toBe(true);
  });
});

// ── Soft signals ──────────────────────────────────────────────────────────────

describe("validateDisclosure — soft signals", () => {
  it("reports navLinkCount correctly", () => {
    const html = `
      <a href="#a">A</a><a href="#b">B</a><a href="#c">C</a>
      <div id="a"></div><div id="b"></div><div id="c"></div>
      <details><summary>S</summary><p>body</p></details>
    `;
    const r = validateDisclosure(html);
    expect(r.navLinkCount).toBe(3);
  });

  it("reports detailsCount correctly for multiple details", () => {
    const html = `
      <details><summary>A</summary><p>body</p></details>
      <details><summary>B</summary><p>body</p></details>
      <details><summary>C</summary><p>body</p></details>
    `;
    const r = validateDisclosure(html);
    expect(r.detailsCount).toBe(3);
    expect(r.summaryCount).toBe(3);
  });
});

// ── Multiple violations ───────────────────────────────────────────────────────

describe("validateDisclosure — multiple violations", () => {
  it("reports all hard failures simultaneously", () => {
    const html = `
      <a href="#ghost">Broken link</a>
      <p>No details either.</p>
    `;
    const r = validateDisclosure(html);
    expect(r.valid).toBe(false);
    expect(r.allAnchorsResolve).toBe(false);
    expect(r.hasProgressiveDisclosure).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});
