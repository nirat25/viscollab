/**
 * VCD interaction runtime — platform-owned, anchor-safe.
 *
 * The conversion LLM emits ONLY declarative markup (classes + data-attributes).
 * All behavior lives here, written once at full quality. This is what lets a
 * cheap model produce artifacts that feel interactive and polished.
 *
 * ANCHOR-SAFETY CONTRACT (comment anchoring is the product's moat — do not break it):
 *  - Never insert, remove, or reorder nodes INSIDE the artifact root.
 *    (Injected chrome, e.g. the reading-progress bar, goes OUTSIDE the root.)
 *  - Never mutate text content at rest. The stat count-up mutates during its
 *    ~800ms animation but always restores the EXACT original string at the end,
 *    so text-quote anchors resolve identically before and after.
 *  - Only toggle classes, [hidden], aria-* attributes, and inline width styles.
 *
 * Usage (React): call initVcdRuntime(artifactEl) after the artifact mounts;
 * call the returned cleanup on unmount. Idempotent per element.
 */

const INIT_FLAG = "vcdRuntimeInit";

export function initVcdRuntime(root: HTMLElement): () => void {
  if (root.dataset[INIT_FLAG] === "1") return () => {};
  root.dataset[INIT_FLAG] = "1";

  const cleanups: Array<() => void> = [
    initTabs(root),
    initBars(root),
    initCountUps(root),
    initScrollspy(root),
    initReadingProgress(root),
    initToggles(root),
  ];

  return () => {
    delete root.dataset[INIT_FLAG];
    for (const fn of cleanups) fn();
  };
}

/* ---- Tabs: model emits all panels visible; we add [hidden] + wire clicks.
 * No-JS fallback is therefore "everything visible" — never content loss. ---- */
function initTabs(root: HTMLElement): () => void {
  const disposers: Array<() => void> = [];
  for (const tabs of root.querySelectorAll<HTMLElement>(".vcd-tabs")) {
    const buttons = Array.from(tabs.querySelectorAll<HTMLButtonElement>("button.vcd-tab"));
    const panels = Array.from(tabs.querySelectorAll<HTMLElement>(".vcd-tab-panel"));
    if (buttons.length < 2 || buttons.length !== panels.length) continue;

    const select = (idx: number) => {
      buttons.forEach((b, i) => {
        b.classList.toggle("active", i === idx);
        b.setAttribute("aria-selected", String(i === idx));
      });
      panels.forEach((p, i) => {
        if (i === idx) p.removeAttribute("hidden");
        else p.setAttribute("hidden", "");
      });
    };
    const onClick = (e: Event) => {
      const idx = buttons.indexOf(e.currentTarget as HTMLButtonElement);
      if (idx >= 0) select(idx);
    };
    buttons.forEach((b) => b.addEventListener("click", onClick));
    select(0);

    disposers.push(() => {
      buttons.forEach((b) => b.removeEventListener("click", onClick));
      panels.forEach((p) => p.removeAttribute("hidden")); // restore no-JS state
    });
  }
  return () => disposers.forEach((d) => d());
}

/* ---- Bars: set fill width from data-pct when scrolled into view ---- */
function initBars(root: HTMLElement): () => void {
  const bars = Array.from(root.querySelectorAll<HTMLElement>(".vcd-bar[data-pct]"));
  if (!bars.length) return () => {};
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        const fill = el.querySelector<HTMLElement>(".vcd-bar-fill");
        const pct = clampPct(el.dataset.pct);
        if (fill && pct !== null) fill.style.width = `${pct}%`;
        io.unobserve(el);
      }
    },
    { threshold: 0.4 }
  );
  bars.forEach((b) => io.observe(b));
  return () => io.disconnect();
}

/* ---- Count-up: animate numeric stat values on first view.
 * Restores the EXACT original string when done (anchor-safe at rest). ---- */
function initCountUps(root: HTMLElement): () => void {
  const els = Array.from(root.querySelectorAll<HTMLElement>(".vcd-stat-value[data-countup]"));
  if (!els.length) return () => {};
  const timers = new Set<number>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        io.unobserve(el);
        const original = el.textContent ?? "";
        const m = original.match(/-?\d[\d,]*(\.\d+)?/);
        if (!m) continue;
        const target = parseFloat(m[0].replace(/,/g, ""));
        if (!isFinite(target)) continue;
        const decimals = m[1] ? m[1].length - 1 : 0;
        const start = performance.now();
        const DURATION = 800;
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / DURATION);
          const eased = 1 - Math.pow(1 - t, 3);
          if (t >= 1) {
            el.textContent = original; // exact restore — anchor-safe
            return;
          }
          const val = (target * eased).toFixed(decimals);
          el.textContent = original.replace(m[0], addThousands(val, m[0].includes(",")));
          timers.add(requestAnimationFrame(tick) as unknown as number);
        };
        timers.add(requestAnimationFrame(tick) as unknown as number);
        // Hard restore guard in case the frame loop is interrupted:
        timers.add(
          window.setTimeout(() => {
            el.textContent = original;
          }, DURATION + 100)
        );
      }
    },
    { threshold: 0.5 }
  );
  els.forEach((el) => io.observe(el));
  return () => {
    io.disconnect();
    timers.forEach((t) => {
      cancelAnimationFrame(t);
      clearTimeout(t);
    });
  };
}

/* ---- Scrollspy: highlight the TOC link of the section in view ---- */
function initScrollspy(root: HTMLElement): () => void {
  const toc = root.querySelector<HTMLElement>("nav.vcd-toc");
  if (!toc) return () => {};
  const links = Array.from(toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
  const byId = new Map<string, HTMLAnchorElement>();
  const targets: HTMLElement[] = [];
  for (const a of links) {
    const id = a.getAttribute("href")!.slice(1);
    const target = id ? root.querySelector<HTMLElement>(`#${cssEscape(id)}`) : null;
    if (target) {
      byId.set(id, a);
      targets.push(target);
    }
  }
  if (!targets.length) return () => {};
  const visible = new Set<string>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).id;
        if (e.isIntersecting) visible.add(id);
        else visible.delete(id);
      }
      // activate the first (top-most in document order) visible section
      let active: string | null = null;
      for (const t of targets) {
        if (visible.has(t.id)) {
          active = t.id;
          break;
        }
      }
      links.forEach((a) => a.classList.remove("active"));
      if (active) byId.get(active)?.classList.add("active");
    },
    { rootMargin: "-10% 0px -60% 0px" }
  );
  targets.forEach((t) => io.observe(t));
  return () => io.disconnect();
}

/* ---- Reading progress bar — injected OUTSIDE the artifact root ---- */
function initReadingProgress(root: HTMLElement): () => void {
  const bar = document.createElement("div");
  bar.className = "vcd-reading-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar); // outside root: artifact DOM untouched
  const onScroll = () => {
    const rect = root.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const read = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1;
    bar.style.width = `${(read * 100).toFixed(2)}%`;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  return () => {
    window.removeEventListener("scroll", onScroll);
    bar.remove();
  };
}

/* ---- Toggles: replace AI-generated inline onclick handlers with robust event listeners ---- */
function initToggles(root: HTMLElement): () => void {
  const disposers: Array<() => void> = [];

  const attachToggle = (
    selector: string,
    toggleSelfClass: string,
    toggleChevronClass: string,
    toggleBodyClass: string,
    isNextSibling: boolean = true
  ) => {
    const headers = Array.from(root.querySelectorAll<HTMLElement>(selector));
    headers.forEach((header) => {
      // Clean up unsafe inline handlers if the AI generated them
      if (header.hasAttribute("onclick")) {
        header.removeAttribute("onclick");
      }
      const onClick = () => {
        header.classList.toggle(toggleSelfClass);
        if (toggleChevronClass) {
          const chevron = header.querySelector(toggleChevronClass);
          if (chevron) chevron.classList.toggle("open");
        }
        if (isNextSibling) {
          const body = header.nextElementSibling as HTMLElement;
          if (body) body.classList.toggle(toggleBodyClass);
        }
      };
      header.addEventListener("click", onClick);
      disposers.push(() => header.removeEventListener("click", onClick));
    });
  };

  // Section Headers
  attachToggle(".section-header", "open", ".chevron", "open");
  // Lever Headers
  attachToggle(".lever-header", "open", "", "open");
  // QA Headers
  attachToggle(".qa-q", "open", ".qa-chevron", "open");

  return () => disposers.forEach((d) => d());
}

/* ---- helpers ---- */
function clampPct(v: string | undefined): number | null {
  const n = Number(v);
  return isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
}
function addThousands(numStr: string, useCommas: boolean): string {
  if (!useCommas) return numStr;
  const [int, dec] = numStr.split(".");
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec ? `${withCommas}.${dec}` : withCommas;
}
function cssEscape(s: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
