"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { locate, type Comment } from "htmlcollab-app/collab";
import SectionToolbar from "./SectionToolbar";
import SelectionCommentPill from "./SelectionCommentPill";

const PREFIX_LEN = 30;
const SELECTION_MIN = 2;

export interface SectionMeta {
  id: string;
  title: string;
}

export interface PendingSelection {
  quote: string;
  prefix: string;
  suffix: string;
  sectionId: string;
}

export interface DocumentSurfaceProps {
  /** Stable identity of the rendered artifact — DOM is only rebuilt when this changes. */
  docId: string;
  versionNumber: number;
  html: string;
  comments: Comment[];
  sectionsMetadata: SectionMeta[];
  sectionIds: string[];
  selectedCommentId: string | null;
  canEdit: boolean;
  canComment: boolean;
  /** Container ref owned by the parent (used for in-page anchor scrolling). */
  previewContainerRef: React.RefObject<HTMLDivElement | null>;
  onSelectComment: (commentId: string) => void;
  /** Whole-section comment via the toolbar button. */
  onCommentSection: (sectionId: string) => void;
  /** Text-selection comment: opens composer pre-filled with the quote. */
  onCommentSelection: (sel: PendingSelection) => void;
}

/* ---- cross-node text math (mirrors comments.ts model) ---- */
function textNodes(root: Node): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) out.push(n as Text);
  return out;
}

function fullText(root: Node): string {
  return textNodes(root)
    .map((n) => n.nodeValue || "")
    .join("");
}

/** Absolute character offset of (node, off) within root's concatenated text. */
function offsetOf(root: Node, node: Node, off: number): number {
  let a = 0;
  for (const t of textNodes(root)) {
    if (t === node) return a + off;
    a += (t.nodeValue || "").length;
  }
  return a;
}

/** Build a Range spanning [start, end) over root's concatenated text nodes. */
function rangeFromOffsets(root: Node, start: number, end: number): Range | null {
  const nodes = textNodes(root);
  let a = 0;
  const r = document.createRange();
  let set = false;
  for (const t of nodes) {
    const len = (t.nodeValue || "").length;
    if (!set && start <= a + len) {
      r.setStart(t, start - a);
      set = true;
    }
    if (set && end <= a + len) {
      r.setEnd(t, end - a);
      return r;
    }
    a += len;
  }
  return null;
}

const supportsHighlightApi =
  typeof window !== "undefined" &&
  typeof (window as any).Highlight !== "undefined" &&
  !!(CSS as any).highlights;

export default function DocumentSurface({
  docId,
  versionNumber,
  html,
  comments,
  sectionsMetadata,
  sectionIds,
  selectedCommentId,
  canEdit,
  canComment,
  previewContainerRef,
  onSelectComment,
  onCommentSection,
  onCommentSelection,
}: DocumentSurfaceProps) {
  const artRef = useRef<HTMLDivElement>(null);

  // Hover toolbar — tracked with refs + state only when the *section* changes.
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const [toolbarTop, setToolbarTop] = useState(0);
  const hoveredElRef = useRef<HTMLElement | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  // Hover-intent: once a toolbar is showing, switching to another section is
  // debounced so the toolbar doesn't flicker away while the pointer travels
  // across intervening sections on its way to the toolbar buttons.
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const HOVER_SWITCH_DELAY = 180;

  // Selection pill.
  const [pill, setPill] = useState<{ left: number; top: number } | null>(null);
  const pendingRef = useRef<PendingSelection | null>(null);

  /* ---------------------------------------------------------------- *
   * 1. STABLE DOM: write innerHTML imperatively, only when html/doc/  *
   *    version actually changes. Never on comment/selection/hover.    *
   * ---------------------------------------------------------------- */
  useEffect(() => {
    const art = artRef.current;
    if (!art) return;
    art.innerHTML = html;

    // Restore persisted <details> open-state for this document.
    let openMap: Record<string, boolean> = {};
    try {
      openMap = JSON.parse(localStorage.getItem(`vc_details_${docId}`) || "{}");
    } catch {
      openMap = {};
    }
    const detailsEls = Array.from(art.querySelectorAll("details"));
    detailsEls.forEach((d, i) => {
      const key = d.id || `__idx_${i}`;
      if (key in openMap) d.open = openMap[key];

      // Keyboard accessibility for the disclosure control (PRD P2-T3).
      const summary = d.querySelector("summary");
      if (summary && !summary.hasAttribute("tabindex")) {
        summary.setAttribute("tabindex", "0");
        summary.setAttribute("role", "button");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, docId, versionNumber]);

  /* persist <details> open-state on toggle (capture phase: native toggle bubbles oddly) */
  const persistDetails = useCallback(() => {
    const art = artRef.current;
    if (!art) return;
    const map: Record<string, boolean> = {};
    Array.from(art.querySelectorAll("details")).forEach((d, i) => {
      const key = d.id || `__idx_${i}`;
      map[key] = (d as HTMLDetailsElement).open;
    });
    try {
      localStorage.setItem(`vc_details_${docId}`, JSON.stringify(map));
    } catch {
      /* ignore quota */
    }
  }, [docId]);

  useEffect(() => {
    const art = artRef.current;
    if (!art) return;
    const handler = () => persistDetails();
    // `toggle` does not bubble — listen in capture phase.
    art.addEventListener("toggle", handler, true);
    return () => art.removeEventListener("toggle", handler, true);
  }, [persistDetails]);

  /* keyboard: Enter/Space on a <summary> toggles its <details> */
  useEffect(() => {
    const art = artRef.current;
    if (!art) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const summary = target.closest("summary");
      if (summary && (e.key === "Enter" || e.key === " ")) {
        const details = summary.parentElement as HTMLDetailsElement | null;
        if (details && details.tagName === "DETAILS") {
          e.preventDefault();
          details.open = !details.open;
        }
      }
    };
    art.addEventListener("keydown", onKey);
    return () => art.removeEventListener("keydown", onKey);
  }, []);

  /* ---------------------------------------------------------------- *
   * 2. COMMENT HIGHLIGHTS via CSS Custom Highlight API.               *
   *    Recomputed when comments / selection / version change, but it  *
   *    NEVER rewrites the DOM — only registers Range-based highlights.*
   * ---------------------------------------------------------------- */
  useEffect(() => {
    const art = artRef.current;
    if (!art) return;
    if (!supportsHighlightApi) return;

    const hiAll = new (window as any).Highlight();
    const hiStale = new (window as any).Highlight();
    const hiActive = new (window as any).Highlight();

    // Clear any element-anchored marker classes from the previous pass.
    art.querySelectorAll(".vc-anno-el, .vc-anno-el-active").forEach((e) =>
      e.classList.remove("vc-anno-el", "vc-anno-el-active")
    );

    for (const c of comments) {
      if (c.lifecycle === "resolved") continue;
      const loc = locate(art, c);
      const isActive = c.id === selectedCommentId;

      if (c.target.type === "text") {
        if (loc.status === "orphaned" || loc.start == null || loc.end == null) continue;
        const r = rangeFromOffsets(art, loc.start, loc.end);
        if (!r) continue;
        if (isActive) hiActive.add(r);
        else if (loc.status === "stale") hiStale.add(r);
        else hiAll.add(r);
      } else if (loc.el) {
        loc.el.classList.add(isActive ? "vc-anno-el-active" : "vc-anno-el");
      }
    }

    (CSS as any).highlights.set("vc-cmt-all", hiAll);
    (CSS as any).highlights.set("vc-cmt-stale", hiStale);
    (CSS as any).highlights.set("vc-cmt-active", hiActive);

    return () => {
      (CSS as any).highlights.delete("vc-cmt-all");
      (CSS as any).highlights.delete("vc-cmt-stale");
      (CSS as any).highlights.delete("vc-cmt-active");
    };
  }, [comments, selectedCommentId, html, versionNumber]);

  /* ---------------------------------------------------------------- *
   * 3. CLICK: hit-test against comment ranges (Highlight API adds no  *
   *    DOM), anchor links, and element-anchored markers.             *
   * ---------------------------------------------------------------- */
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const art = artRef.current;
      if (!art) return;
      const target = e.target as HTMLElement;

      // In-page anchor links.
      const anchor = target.closest("a");
      if (anchor) {
        const href = anchor.getAttribute("href");
        if (href && href.startsWith("#")) {
          e.preventDefault();
          const container = previewContainerRef.current;
          const targetId = href.slice(1);
          if (container) {
            if (targetId === "top") {
              container.scrollTo({ top: 0, behavior: "smooth" });
            } else {
              const el = art.querySelector(`#${CSS.escape(targetId)}`) as HTMLElement | null;
              if (el) {
                const cRect = container.getBoundingClientRect();
                const tRect = el.getBoundingClientRect();
                container.scrollTo({
                  top: tRect.top - cRect.top + container.scrollTop,
                  behavior: "smooth",
                });
              }
            }
          }
          return;
        }
      }

      // Element-anchored comment marker.
      const markerEl = target.closest(".vc-anno-el, .vc-anno-el-active") as HTMLElement | null;
      if (markerEl) {
        const hit = comments.find((c) => {
          if (c.lifecycle === "resolved" || c.target.type !== "element") return false;
          const loc = locate(art, c);
          return loc.el === markerEl;
        });
        if (hit) {
          onSelectComment(hit.id);
          return;
        }
      }

      // Text-anchored comment: hit-test the click offset against ranges.
      const sel = window.getSelection();
      if (sel && sel.isCollapsed && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0);
        if (art.contains(r.startContainer)) {
          const clickOffset = offsetOf(art, r.startContainer, r.startOffset);
          const hit = comments.find((c) => {
            if (c.lifecycle === "resolved" || c.target.type !== "text") return false;
            const loc = locate(art, c);
            return (
              loc.status !== "orphaned" &&
              loc.start != null &&
              loc.end != null &&
              clickOffset >= loc.start &&
              clickOffset < loc.end
            );
          });
          if (hit) onSelectComment(hit.id);
        }
      }
    },
    [comments, onSelectComment, previewContainerRef]
  );

  /* ---------------------------------------------------------------- *
   * 4. HOVER: track via refs + rAF. setState only when the hovered    *
   *    section ID changes (not per pixel). Faint gutter cue applied   *
   *    imperatively as a CSS class — no DOM rebuild.                  *
   * ---------------------------------------------------------------- */
  const applyHover = useCallback(
    (id: string | null) => {
      const art = artRef.current;
      const container = previewContainerRef.current;
      if (!art || !container) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        // Swap the faint gutter cue imperatively.
        if (hoveredElRef.current) hoveredElRef.current.classList.remove("vc-section-hover");
        const nextEl = id ? (art.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null) : null;
        if (nextEl) {
          nextEl.classList.add("vc-section-hover");
          const cRect = container.getBoundingClientRect();
          const r = nextEl.getBoundingClientRect();
          setToolbarTop(r.top - cRect.top + container.scrollTop);
        }
        hoveredElRef.current = nextEl;
        hoveredIdRef.current = id;
        setHoveredSectionId(id);
      });
    },
    [previewContainerRef]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const art = artRef.current;
      const container = previewContainerRef.current;
      if (!art || !container) return;
      const target = e.target as HTMLElement;

      if (target.closest("[data-section-toolbar]")) return;

      const sectionEl = target.closest("[id]") as HTMLElement | null;
      const id =
        sectionEl &&
        sectionEl.id &&
        sectionEl.id !== "top" &&
        sectionIds.includes(sectionEl.id)
          ? sectionEl.id
          : null;

      if (id === hoveredIdRef.current) {
        // Pointer is back over the active section — cancel any pending switch.
        if (switchTimerRef.current) {
          clearTimeout(switchTimerRef.current);
          switchTimerRef.current = null;
        }
        return;
      }

      if (hoveredIdRef.current === null) {
        // Nothing showing yet — respond immediately.
        applyHover(id);
        return;
      }

      // A toolbar is showing: debounce the switch (hover intent) so brushing
      // across section boundaries doesn't yank the toolbar out from under the
      // pointer mid-travel.
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
      switchTimerRef.current = setTimeout(() => {
        switchTimerRef.current = null;
        applyHover(id);
      }, HOVER_SWITCH_DELAY);
    },
    [sectionIds, previewContainerRef, applyHover]
  );

  const clearHover = useCallback((e?: React.MouseEvent) => {
    // The toolbar is a *sibling* of the artifact div, so moving the pointer
    // onto it fires mouseleave here. Keep the toolbar alive in that case —
    // otherwise it unmounts before its buttons can be clicked.
    const related = e?.relatedTarget as HTMLElement | null;
    if (related && typeof related.closest === "function" && related.closest("[data-section-toolbar]")) {
      return;
    }
    if (switchTimerRef.current) {
      clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (hoveredElRef.current) hoveredElRef.current.classList.remove("vc-section-hover");
    hoveredElRef.current = null;
    hoveredIdRef.current = null;
    setHoveredSectionId(null);
  }, []);

  // When the pointer leaves the toolbar itself (not back into the artifact),
  // clear the hover state so the toolbar doesn't linger.
  const handleToolbarMouseLeave = useCallback(
    (e: React.MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (related && typeof related.closest === "function" && artRef.current?.contains(related)) {
        return; // back into the document — mousemove will take over
      }
      clearHover();
    },
    [clearHover]
  );

  // Re-measure toolbar position on scroll without re-rendering the artifact.
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const el = hoveredElRef.current;
      if (!el) return;
      const cRect = container.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setToolbarTop(r.top - cRect.top + container.scrollTop);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [previewContainerRef]);

  /* ---------------------------------------------------------------- *
   * 5. TEXT SELECTION -> floating comment pill.                       *
   * ---------------------------------------------------------------- */
  const handleMouseUp = useCallback(() => {
    const art = artRef.current;
    if (!art || !canComment) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      return;
    }
    const r = sel.getRangeAt(0);
    if (!art.contains(r.commonAncestorContainer)) return;

    const text = fullText(art);
    const start = offsetOf(art, r.startContainer, r.startOffset);
    const end = offsetOf(art, r.endContainer, r.endOffset);
    const [lo, hi] = start <= end ? [start, end] : [end, start];
    if (hi - lo < SELECTION_MIN) return;

    const quote = text.slice(lo, hi);
    if (!quote.trim()) return;

    // Determine which section the selection lives in.
    const startEl =
      r.startContainer.nodeType === Node.TEXT_NODE
        ? r.startContainer.parentElement
        : (r.startContainer as HTMLElement);
    const sectionEl = startEl?.closest("[id]") as HTMLElement | null;
    const sectionId =
      sectionEl && sectionEl.id && sectionEl.id !== "top" ? sectionEl.id : sectionIds[0] || "";

    pendingRef.current = {
      quote,
      prefix: text.slice(Math.max(0, lo - PREFIX_LEN), lo),
      suffix: text.slice(hi, hi + PREFIX_LEN),
      sectionId,
    };

    const rect = r.getBoundingClientRect();
    setPill({
      left: rect.left + rect.width / 2 - 48,
      top: rect.bottom + 8,
    });
  }, [canComment, sectionIds]);

  // Dismiss the pill on Esc / outside click / selection collapse.
  useEffect(() => {
    if (!pill) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPill(null);
        pendingRef.current = null;
      }
    };
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-testid="selection-comment-pill"]')) return;
      setPill(null);
      pendingRef.current = null;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [pill]);

  const handlePillClick = useCallback(() => {
    if (pendingRef.current) {
      onCommentSelection(pendingRef.current);
    }
    setPill(null);
    pendingRef.current = null;
    window.getSelection()?.removeAllRanges();
  }, [onCommentSelection]);

  const hoveredMeta = useMemo(
    () => sectionsMetadata.find((m) => m.id === hoveredSectionId),
    [sectionsMetadata, hoveredSectionId]
  );

  return (
    <>
      <div
        ref={artRef}
        data-testid="document-surface"
        className="vc-artifact relative cursor-text select-text"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={clearHover}
        onMouseUp={handleMouseUp}
      />

      {hoveredSectionId && (
        <SectionToolbar
          onMouseLeave={handleToolbarMouseLeave}
          sectionId={hoveredSectionId}
          title={hoveredMeta?.title || hoveredSectionId}
          top={toolbarTop}
          canComment={canComment}
          onComment={onCommentSection}
        />
      )}

      {pill && (
        <SelectionCommentPill left={pill.left} top={pill.top} onClick={handlePillClick} />
      )}
    </>
  );
}
