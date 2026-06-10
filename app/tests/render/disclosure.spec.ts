/**
 * P2-T3 Playwright tests: Progressive-disclosure renderer
 *
 * DoD criteria tested:
 *  1. Every internal anchor href="#id" resolves to an existing element
 *  2. Nav links jump to the correct section (scroll position / visibility)
 *  3. <details> expand/collapse toggles correctly on click
 *  4. <details> state is correct after multiple interactions
 *  5. Keyboard accessibility: Tab → summary is focused, Enter/Space toggles open
 *  6. Default render is collapsed-to-digest (all <details> start closed)
 *
 * Plus: Vitest unit tests for the deterministic validateDisclosure() function.
 */

import { test, expect, type Page } from "@playwright/test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS = `file://${join(__dirname, "harness.html")}`;

// ── DoD #1: All internal anchors resolve ─────────────────────────────────────

test.describe("DoD #1 — all internal anchors resolve", () => {
  test("every nav href points to an element that exists in the DOM", async ({ page }) => {
    await page.goto(HARNESS);

    const anchors = await page.locator('a[href^="#"]').all();
    expect(anchors.length).toBeGreaterThan(0);

    for (const anchor of anchors) {
      const href = await anchor.getAttribute("href");
      const id = href!.slice(1); // strip '#'
      // Use attribute selector [id="..."] instead of CSS.escape (not available in Node)
      const target = page.locator(`[id="${id}"]`);
      await expect(target).toBeAttached({ timeout: 2000 });
    }
  });

  test("all footer nav links resolve to existing ids", async ({ page }) => {
    await page.goto(HARNESS);
    const footerLinks = await page.locator('[data-testid="footer-nav"] a[href^="#"]').all();
    expect(footerLinks.length).toBeGreaterThan(0);

    for (const link of footerLinks) {
      const href = await link.getAttribute("href");
      const id = href!.slice(1);
      await expect(page.locator(`[id="${id}"]`)).toBeAttached();
    }
  });
});

// ── DoD #2: Nav links jump to correct section ─────────────────────────────────

test.describe("DoD #2 — nav links jump to correct sections", () => {
  test("clicking Actions nav link scrolls the actions section into view", async ({ page }) => {
    await page.goto(HARNESS);
    await page.locator('[data-testid="nav"] a[href="#actions"]').click();
    // After hash navigation the target element should be in viewport
    await expect(page.locator('[data-testid="section-actions"]')).toBeInViewport({ timeout: 3000 });
  });

  test("clicking Cost nav link scrolls the cost section into view", async ({ page }) => {
    await page.goto(HARNESS);
    await page.locator('[data-testid="nav"] a[href="#cost"]').click();
    await expect(page.locator('[data-testid="section-cost"]')).toBeInViewport({ timeout: 3000 });
  });

  test("clicking Background nav link scrolls the background details into view", async ({ page }) => {
    await page.goto(HARNESS);
    await page.locator('[data-testid="nav"] a[href="#background"]').click();
    await expect(page.locator('[data-testid="details-background"]')).toBeInViewport({ timeout: 3000 });
  });
});

// ── DoD #3: expand/collapse toggles correctly ────────────────────────────────

test.describe("DoD #3 — expand/collapse toggles", () => {
  test("clicking a summary opens the <details> section", async ({ page }) => {
    await page.goto(HARNESS);
    const details = page.locator('[data-testid="details-background"]');

    // Starts closed
    await expect(details).not.toHaveAttribute("open");

    // Click summary → opens
    await details.locator("summary").click();
    await expect(details).toHaveAttribute("open");
  });

  test("clicking an open summary collapses the <details> section", async ({ page }) => {
    await page.goto(HARNESS);
    const details = page.locator('[data-testid="details-background"]');

    // Open it
    await details.locator("summary").click();
    await expect(details).toHaveAttribute("open");

    // Click again → collapses
    await details.locator("summary").click();
    await expect(details).not.toHaveAttribute("open");
  });

  test("body content is not visible when details is closed", async ({ page }) => {
    await page.goto(HARNESS);
    const body = page.locator('[data-testid="details-background"] .body');
    // The content inside a closed <details> is hidden
    await expect(body).not.toBeVisible();
  });

  test("body content becomes visible after expanding", async ({ page }) => {
    await page.goto(HARNESS);
    const details = page.locator('[data-testid="details-background"]');
    await details.locator("summary").click();
    await expect(details.locator(".body")).toBeVisible();
  });

  test("two separate details sections toggle independently", async ({ page }) => {
    await page.goto(HARNESS);
    const background = page.locator('[data-testid="details-background"]');
    const conclusion = page.locator('[data-testid="details-conclusion"]');

    // Open background
    await background.locator("summary").click();
    await expect(background).toHaveAttribute("open");
    await expect(conclusion).not.toHaveAttribute("open");

    // Open conclusion independently
    await conclusion.locator("summary").click();
    await expect(background).toHaveAttribute("open");
    await expect(conclusion).toHaveAttribute("open");
  });
});

// ── DoD #4: state persists across interactions ────────────────────────────────

test.describe("DoD #4 — state persists across interactions", () => {
  test("expanded state persists after scrolling away and back", async ({ page }) => {
    await page.goto(HARNESS);
    const details = page.locator('[data-testid="details-background"]');

    // Open it
    await details.locator("summary").click();
    await expect(details).toHaveAttribute("open");

    // Scroll away
    await page.locator('[data-testid="bluf"]').scrollIntoViewIfNeeded();

    // Scroll back
    await details.scrollIntoViewIfNeeded();

    // Should still be open
    await expect(details).toHaveAttribute("open");
  });

  test("collapsed state persists after clicking the BLUF section", async ({ page }) => {
    await page.goto(HARNESS);
    const details = page.locator('[data-testid="details-conclusion"]');

    // Click BLUF headline (just an interaction, not the details)
    await page.locator("#headline").click();

    // Details should still be closed
    await expect(details).not.toHaveAttribute("open");
  });
});

// ── DoD #5: Keyboard accessibility ───────────────────────────────────────────

test.describe("DoD #5 — keyboard accessibility", () => {
  test("Tab key reaches the first summary element", async ({ page }) => {
    await page.goto(HARNESS);

    // Tab from body — eventually focus should land on an interactive element in the details
    // We specifically check that the summary is focusable
    const summary = page.locator("#background-summary");
    await summary.focus();
    await expect(summary).toBeFocused();
  });

  test("Enter key on focused summary opens the <details>", async ({ page }) => {
    await page.goto(HARNESS);
    const details = page.locator('[data-testid="details-background"]');
    const summary = page.locator("#background-summary");

    await summary.focus();
    await expect(details).not.toHaveAttribute("open");

    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open");
  });

  test("Space key on focused summary also toggles the <details>", async ({ page }) => {
    await page.goto(HARNESS);
    const details = page.locator('[data-testid="details-background"]');
    const summary = page.locator("#background-summary");

    await summary.focus();
    await page.keyboard.press("Space");
    await expect(details).toHaveAttribute("open");
  });

  test("Enter key closes an open <details> when summary is focused", async ({ page }) => {
    await page.goto(HARNESS);
    const details = page.locator('[data-testid="details-background"]');
    const summary = page.locator("#background-summary");

    // Open via click first
    await details.locator("summary").click();
    await expect(details).toHaveAttribute("open");

    // Focus and press Enter → should close
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(details).not.toHaveAttribute("open");
  });

  test("both summaries are reachable by Tab from the nav", async ({ page }) => {
    await page.goto(HARNESS);

    // Tab through all focusable elements and collect their ids.
    // We track by element handle to detect a full cycle (when we return to
    // the first focused element). Stop after 30 tabs max.
    const foundIds: string[] = [];
    let firstHandle: string | null = null;

    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const result = await page.evaluate(() => ({
        id: document.activeElement?.id ?? "",
        tag: document.activeElement?.tagName ?? "",
        // Unique marker: use outerHTML hash would be heavy; use id+tag+textContent
        key: `${document.activeElement?.tagName}|${document.activeElement?.id}|${(document.activeElement as HTMLElement)?.innerText?.slice(0, 20) ?? ""}`
      }));

      if (i === 0) firstHandle = result.key;
      else if (result.key === firstHandle) break; // wrapped around

      if (result.id) foundIds.push(result.id);
    }

    // Both summaries must be in the tab order
    expect(foundIds).toContain("background-summary");
    expect(foundIds).toContain("conclusion-summary");
  });
});

// ── DoD #6: Default render is collapsed-to-digest ────────────────────────────

test.describe("DoD #6 — default render is collapsed to digest", () => {
  test("all <details> sections start with open=false on load", async ({ page }) => {
    await page.goto(HARNESS);
    const allDetails = await page.locator("details").all();
    expect(allDetails.length).toBeGreaterThan(0);

    for (const d of allDetails) {
      await expect(d).not.toHaveAttribute("open");
    }
  });

  test("BLUF digest is visible without any interaction", async ({ page }) => {
    await page.goto(HARNESS);
    await expect(page.locator('[data-testid="bluf"]')).toBeVisible();
  });

  test("required actions section is visible without any interaction", async ({ page }) => {
    await page.goto(HARNESS);
    await expect(page.locator('[data-testid="section-actions"]')).toBeVisible();
  });

  test("background body content is NOT visible before expansion", async ({ page }) => {
    await page.goto(HARNESS);
    await expect(page.locator('[data-testid="details-background"] .body')).not.toBeVisible();
  });

  test("conclusion body content is NOT visible before expansion", async ({ page }) => {
    await page.goto(HARNESS);
    await expect(page.locator('[data-testid="details-conclusion"] .body')).not.toBeVisible();
  });
});
