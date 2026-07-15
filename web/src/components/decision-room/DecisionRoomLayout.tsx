"use client";

/**
 * DecisionRoomLayout (ROOM-002) — the 3-pane shell: top bar, collapsible left
 * workspace/doc nav, center canvas, right review rail.
 *
 * Applies `.decision-room-root` at its root and imports `decision-room.css`
 * (brief §7.2 Phase-6 review note: today only preview routes do this). Light
 * executive styling only — no backdrop-filter, no gradients, no glow, no dark
 * surfaces. Purely presentational: every slot is a caller-supplied ReactNode;
 * DecisionRoomApp owns all data/handlers.
 *
 * Preserves the tour target ids: `tour-sidebar` (nav aside) and
 * `tour-center-preview` (canvas pane) live here; `tour-right-collab` lives on
 * `ReviewRail`/`CommentSidebar` itself.
 */

import type { ReactNode, RefObject } from "react";
import "@/app/decision-room.css";

export interface DecisionRoomLayoutProps {
  topBar: ReactNode;
  nav: ReactNode;
  canvas: ReactNode;
  reviewRail: ReactNode | null;
  isCommentsOpen: boolean;
  isSidebarOpen: boolean;
  onCloseSidebar: () => void;
  /** Onboarding tour highlight state (brief: preserve existing tour behavior). */
  tourNavActive: boolean;
  tourCanvasActive: boolean;
  /** Phase 7 (COLLAB-004): attached to the 3-pane root so `useCommentLinks`
   *  can delegate hover/click across BOTH the canvas and the review rail
   *  (a card hover must be able to light a canvas node and vice versa). */
  rootRef?: RefObject<HTMLDivElement | null>;
}

export default function DecisionRoomLayout({
  topBar,
  nav,
  canvas,
  reviewRail,
  isCommentsOpen,
  isSidebarOpen,
  onCloseSidebar,
  tourNavActive,
  tourCanvasActive,
  rootRef,
}: DecisionRoomLayoutProps) {
  const navOpen = isSidebarOpen || tourNavActive;

  return (
    <div ref={rootRef} className="decision-room-root pane-layout-container font-sans">
      {/* Left nav overlay (mobile/collapsed-drawer pattern, unchanged from the
          pre-decomposition behavior — a plain scrim, no blur). */}
      <div
        className={`dr-nav-overlay ${navOpen ? "dr-nav-overlay-visible" : ""}`}
        onClick={onCloseSidebar}
      />

      <aside
        id="tour-sidebar"
        className={`dr-nav-aside fixed inset-y-0 left-0 z-50 shadow-2xl transform transition-transform duration-300 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        } ${tourNavActive ? "dr-nav-aside-tour" : ""}`}
      >
        {nav}
      </aside>

      <div className="pane-workspace-frame">
        {topBar}

        <div className={`pane-main-content transition-all ${isCommentsOpen ? "" : "max-w-5xl"}`}>
          <div
            id="tour-center-preview"
            className={`pane-center-preview ${tourCanvasActive ? "dr-canvas-tour" : ""}`}
          >
            {canvas}
          </div>

          {isCommentsOpen && reviewRail}
        </div>
      </div>
    </div>
  );
}
