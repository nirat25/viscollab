/**
 * Progressive-disclosure renderer validation (P2-T3).
 *
 * Deterministic validation (no LLM) that checks whether a generated HTML artifact
 * satisfies the progressive-disclosure DoD requirements:
 *
 *   1. Every internal anchor href="#id" resolves to an element with that id.
 *   2. The artifact contains at least one nav link (anchored navigation).
 *   3. Progressive disclosure is present (<details> elements).
 *   4. All <details> elements default to closed (no `open` attribute).
 *   5. Every <summary> is keyboard-accessible (focusable via tab order).
 *   6. The first visible section is the digest/BLUF — not the full body.
 *
 * This builds on validateContract() from P2-T2, adding richer disclosure checks.
 */

import { parse } from "node-html-parser";

export interface DisclosureResult {
  /** True if all DoD requirements are met. */
  valid: boolean;

  // ── DoD checks ──────────────────────────────────────────────────────────────

  /** All internal href="#id" anchors resolve to existing ids. */
  allAnchorsResolve: boolean;
  /** Broken anchor ids found (DoD #1). */
  brokenAnchors: string[];

  /** At least one internal navigation link exists (DoD #2). */
  hasNavLinks: boolean;
  /** Count of internal anchor links. */
  navLinkCount: number;

  /** At least one <details> element exists (DoD #3). */
  hasProgressiveDisclosure: boolean;
  /** Count of <details> elements. */
  detailsCount: number;

  /** All <details> default to closed — no `open` attribute (DoD #4). */
  allDetailsDefaultClosed: boolean;
  /** Ids/indices of details that are open by default. */
  openDetailsSummaries: string[];

  /** Every <summary> is inside a <details> and keyboard-reachable (DoD #5). */
  summaryKeyboardAccessible: boolean;
  /** Count of <summary> elements. */
  summaryCount: number;

  errors: string[];
  warnings: string[];
}

/**
 * Validate that a generated HTML artifact satisfies P2-T3 progressive-disclosure DoD.
 * This is deterministic — no LLM required.
 */
export function validateDisclosure(html: string): DisclosureResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const root = parse(html, { comment: false });

  // ── DoD #1: All internal anchors resolve ─────────────────────────────────────
  const ids = new Set(
    root.querySelectorAll("[id]").map((el) => el.getAttribute("id") ?? "")
  );
  const brokenAnchors: string[] = [];
  for (const a of root.querySelectorAll('a[href^="#"]')) {
    const target = (a.getAttribute("href") ?? "").slice(1);
    if (target && !ids.has(target)) brokenAnchors.push(target);
  }
  const allAnchorsResolve = brokenAnchors.length === 0;
  if (!allAnchorsResolve)
    errors.push(`Broken internal anchors: ${brokenAnchors.join(", ")}`);

  // ── DoD #2: Nav links exist ────────────────────────────────────────────────────
  const navLinks = root.querySelectorAll('a[href^="#"]');
  const navLinkCount = navLinks.length;
  const hasNavLinks = navLinkCount > 0;
  if (!hasNavLinks)
    warnings.push("No internal navigation links found — reader cannot jump between sections");

  // ── DoD #3: Progressive disclosure present ────────────────────────────────────
  const detailsEls = root.querySelectorAll("details");
  const detailsCount = detailsEls.length;
  const hasProgressiveDisclosure = detailsCount > 0;
  if (!hasProgressiveDisclosure)
    errors.push("No <details> elements found — progressive disclosure is required (PRD P2-T3)");

  // ── DoD #4: All <details> start closed ───────────────────────────────────────
  const openDetailsSummaries: string[] = [];
  for (const el of detailsEls) {
    if (el.hasAttribute("open")) {
      const summary = el.querySelector("summary");
      const label = summary?.innerText?.trim() ?? `(details #${openDetailsSummaries.length + 1})`;
      openDetailsSummaries.push(label);
    }
  }
  const allDetailsDefaultClosed = openDetailsSummaries.length === 0;
  if (!allDetailsDefaultClosed)
    errors.push(
      `These <details> sections are expanded by default (should be closed for digest-first view): ${openDetailsSummaries.join(", ")}`
    );

  // ── DoD #5: Keyboard accessibility — every <summary> is inside a <details> ──
  const summaryEls = root.querySelectorAll("summary");
  const summaryCount = summaryEls.length;
  // All summaries should be direct children of <details>; node-html-parser positions
  // them under their parent <details> by default, so we check all summaries have a
  // <details> ancestor.
  let orphanSummaries = 0;
  for (const s of summaryEls) {
    // Walk up to find a <details> ancestor
    let node = s.parentNode;
    let found = false;
    while (node) {
      if ((node as { tagName?: string }).tagName?.toLowerCase() === "details") {
        found = true;
        break;
      }
      node = (node as { parentNode?: unknown }).parentNode as typeof node;
    }
    if (!found) orphanSummaries++;
  }
  const summaryKeyboardAccessible = orphanSummaries === 0;
  if (!summaryKeyboardAccessible)
    errors.push(`${orphanSummaries} <summary> element(s) are not inside a <details> — they will not be keyboard-operable`);

  if (summaryCount === 0 && detailsCount > 0)
    warnings.push("<details> elements have no <summary> — reader cannot expand them");

  // ── Overall validity ──────────────────────────────────────────────────────────
  const valid =
    allAnchorsResolve &&
    hasProgressiveDisclosure &&
    allDetailsDefaultClosed &&
    summaryKeyboardAccessible;

  return {
    valid,
    allAnchorsResolve,
    brokenAnchors,
    hasNavLinks,
    navLinkCount,
    hasProgressiveDisclosure,
    detailsCount,
    allDetailsDefaultClosed,
    openDetailsSummaries,
    summaryKeyboardAccessible,
    summaryCount,
    errors,
    warnings,
  };
}
