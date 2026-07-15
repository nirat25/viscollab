"use client";

/**
 * useCommentLinks (Phase 7, COLLAB-004 + BACK-008 follow-on) — the delegated
 * hover/click controller linking comment cards (rail) to canvas nodes
 * (`[data-semantic-node-id]`) and back, plus per-node OPEN-comment-count
 * badge stamping.
 *
 * ARCH DECISION (brief §6.2): pure CSS-class toggling via ONE delegated
 * mouseover/mouseout/click listener set on the decision-room root — NOT React
 * state. The visual nodes live in the ProseMirror NodeView subtree (leaf
 * components / xyflow) and the comment cards live in the rail: two disjoint
 * React subtrees. Lifting hover into `DecisionRoomApp` state would re-render
 * the editor + xyflow canvas on every hover — the exact render-storm the
 * project already fixed once for the hover toolbar (`HOVER_SWITCH_DELAY`).
 * Event delegation keeps hover/click entirely off the React render path and
 * requires zero changes to the Phase-5 leaf components (they already emit
 * `data-semantic-node-id`).
 *
 * Listeners are bound ONCE per mount (empty dep on `rootRef`) via ref-read
 * closures, so re-renders never rebind them; all volatile values (comments,
 * artifact, callbacks) are read through refs — mirroring the 3s-poll
 * snapshot-ref discipline in `DecisionRoomApp` (never tear down/recreate a
 * subscription just because state changed).
 */

import { useEffect, useRef, type RefObject } from "react";
import type { Comment, CommentGesture } from "htmlcollab-app/collab";
import type { SemanticArtifact } from "htmlcollab-app/semantic";
import { nodeDisplayTitle } from "@/components/visual/shared";

export interface UseCommentLinksArgs {
  /** Root DOM node wrapping BOTH the canvas pane and the review rail — a card
   *  hover must be able to light a canvas node and vice versa (brief §6.2). */
  rootRef: RefObject<HTMLElement | null>;
  comments: Comment[];
  /** The live artifact — resolves a clicked node's kind/label snapshot and
   *  confirms the node exists. Undefined for legacy docs (no semantic
   *  artifact); the delegated listeners then simply find nothing to act on,
   *  since legacy DocumentSurface never emits `data-semantic-node-id`. */
  artifact: SemanticArtifact | undefined;
  onSelectComment: (commentId: string) => void;
  onStartComment: (gesture: NonNullable<CommentGesture["semantic"]>) => void;
}

function cssEscape(id: string): string {
  if (typeof window !== "undefined" && window.CSS && window.CSS.escape) {
    return window.CSS.escape(id);
  }
  return id;
}

function toggleLinkActive(root: ParentNode, nodeId: string, active: boolean) {
  const escaped = cssEscape(nodeId);
  let matches: NodeListOf<Element>;
  try {
    matches = root.querySelectorAll(
      `[data-semantic-node-id="${escaped}"], [data-comment-target-node-id="${escaped}"]`
    );
  } catch {
    return;
  }
  matches.forEach((el) => el.classList.toggle("dr-link-active", active));
}

/** Resolve the semantic node id a delegated hover event pertains to, from
 *  either origin: a canvas node (`data-semantic-node-id`) or a rail card
 *  (`data-comment-target-node-id`, read off the nearest `[data-comment-id]`). */
function resolveHoverNodeId(target: Element): string | null {
  const nodeEl = target.closest("[data-semantic-node-id]");
  if (nodeEl) return nodeEl.getAttribute("data-semantic-node-id");
  const cardEl = target.closest("[data-comment-id]");
  if (cardEl) return cardEl.getAttribute("data-comment-target-node-id");
  return null;
}

/**
 * Mounts the delegated hover/click linking + badge stamping on `rootRef`.
 * Call once from `DecisionRoomApp`; no return value (all effects are
 * imperative DOM side effects, per the ARCH DECISION above).
 */
export function useCommentLinks({
  rootRef,
  comments,
  artifact,
  onSelectComment,
  onStartComment,
}: UseCommentLinksArgs): void {
  const commentsRef = useRef(comments);
  const artifactRef = useRef(artifact);
  const onSelectCommentRef = useRef(onSelectComment);
  const onStartCommentRef = useRef(onStartComment);
  useEffect(() => {
    commentsRef.current = comments;
    artifactRef.current = artifact;
    onSelectCommentRef.current = onSelectComment;
    onStartCommentRef.current = onStartComment;
  }, [comments, artifact, onSelectComment, onStartComment]);

  // Delegated mouseover/mouseout/click — bound ONCE on mount, cleaned up on
  // unmount only. Deliberately no deps beyond `rootRef` (a stable ref object)
  // so re-renders never rebind these listeners.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const nodeId = resolveHoverNodeId(target);
      if (nodeId) toggleLinkActive(root, nodeId, true);
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const nodeId = resolveHoverNodeId(target);
      if (nodeId) toggleLinkActive(root, nodeId, false);
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      // Only canvas-node origin creates/opens a comment; clicking a rail card
      // is handled by the rail's own onClick (selection), not here.
      const nodeEl = target.closest("[data-semantic-node-id]");
      if (!nodeEl) return;
      const nodeId = nodeEl.getAttribute("data-semantic-node-id");
      if (!nodeId) return;

      const artifactNow = artifactRef.current;
      if (!artifactNow) return; // no semantic artifact -> no anchoring context

      const existing = commentsRef.current.find(
        (c) => c.target.type === "semantic" && c.target.semanticNodeId === nodeId
      );
      if (existing) {
        onSelectCommentRef.current(existing.id);
        return;
      }

      const blockEl = nodeEl.closest("[data-visual-block-id]");
      const visualBlockId = blockEl?.getAttribute("data-visual-block-id") ?? undefined;
      const node = artifactNow.nodes.find((n) => n.id === nodeId);

      onStartCommentRef.current({
        artifactId: artifactNow.id,
        semanticNodeId: nodeId,
        visualBlockId,
        nodeKind: node?.kind,
        nodeLabel: node ? nodeDisplayTitle(node) : undefined,
      });
    };

    root.addEventListener("mouseover", handleMouseOver);
    root.addEventListener("mouseout", handleMouseOut);
    root.addEventListener("click", handleClick);

    return () => {
      root.removeEventListener("mouseover", handleMouseOver);
      root.removeEventListener("mouseout", handleMouseOut);
      root.removeEventListener("click", handleClick);
      root.querySelectorAll(".dr-link-active").forEach((el) => el.classList.remove("dr-link-active"));
    };
  }, [rootRef]);

  // Badge stamping (requirement 7): data-comment-count = count of OPEN
  // semantic-target comments per node id. Re-runs on comment/artifact change
  // (per brief) AND on DOM mutation — VisualTabs remounts the canvas subtree
  // under the same root on every tab switch (no comments/artifact change),
  // so a MutationObserver keeps a freshly-mounted tab's nodes stamped instead
  // of leaving them bare until the next comment edit.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const stamp = () => {
      const counts = new Map<string, number>();
      for (const c of commentsRef.current) {
        if (c.lifecycle !== "open") continue;
        if (c.target.type !== "semantic") continue;
        counts.set(c.target.semanticNodeId, (counts.get(c.target.semanticNodeId) ?? 0) + 1);
      }
      root.querySelectorAll("[data-semantic-node-id]").forEach((el) => {
        const id = el.getAttribute("data-semantic-node-id");
        const n = (id && counts.get(id)) || 0;
        el.setAttribute("data-comment-count", String(n));
      });
    };

    stamp();
    const observer = new MutationObserver(stamp);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      root.querySelectorAll("[data-comment-count]").forEach((el) => el.removeAttribute("data-comment-count"));
    };
  }, [rootRef, comments, artifact]);
}
