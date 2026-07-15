"use client";

/**
 * ReviewRail (Phase 7, COLLAB-003) — the redesigned, light, grouped,
 * filterable review rail for decision rooms. Replaces the 4-line
 * `CommentSidebar` pass-through (BACK-016 retired for decision rooms — brief
 * §4 ARCH DECISION: this rail is decision-room-only; the legacy dark
 * `CommentSidebar` stays untouched for legacy docs — see `DecisionRoomApp`'s
 * router).
 *
 * Groups (fixed order, empty groups hidden): Blockers · Risks · Questions ·
 * Decisions · Actions · Resolved (`REVIEW_GROUP_ORDER` / `groupOfComment`,
 * `htmlcollab-app/collab`). Filters (`unresolved · mine · blockers · stale`)
 * are pure client view state, AND-combined, never persisted or sent to any
 * endpoint (tenet #3 — no surveillance).
 *
 * Presentational only: data + callbacks arrive as props, no fetching. Cards
 * emit `data-comment-id` and (semantic targets) `data-comment-target-node-id`
 * — the reverse-link contract `useCommentLinks` depends on.
 */

import { useMemo, useState } from "react";
import { Plus, X, Send, Check } from "lucide-react";
import {
  groupOfComment,
  resolveSemanticTarget,
  REVIEW_GROUP_ORDER,
  REVIEW_GROUP_LABEL,
  REVIEW_FILTER_PREDICATES,
  type Comment,
  type CommentGesture,
  type ReviewGroup,
  type ReviewFilterCtx,
  type ReviewFilterKey,
} from "htmlcollab-app/collab";
import type { SemanticArtifact, SemanticNode, SemanticNodeKind } from "htmlcollab-app/semantic";
import { kindLabel, nodeDisplayTitle } from "@/components/visual/shared";

const FILTER_LABEL: Record<ReviewFilterKey, string> = {
  unresolved: "Unresolved",
  mine: "Mine",
  blockers: "Blockers",
  stale: "Stale",
};

const FILTER_ORDER = Object.keys(REVIEW_FILTER_PREDICATES) as ReviewFilterKey[];

const FEEDBACK_BADGE_LABEL: Record<NonNullable<Comment["feedbackType"]>, string> = {
  needs: "Needs Data",
  flag: "Risk",
  approve: "Approved",
  question: "Question",
};

/** Resolve the live node kind for a semantic-target comment (via
 *  `resolveSemanticTarget`), falling back to the creation-time snapshot when
 *  the artifact is unavailable/node is gone. `undefined` for text/element
 *  targets — `groupOfComment` falls back to `feedbackType` in that case. */
function kindOf(c: Comment, artifact: SemanticArtifact | undefined): SemanticNodeKind | undefined {
  if (c.target.type !== "semantic") return undefined;
  if (artifact) {
    const r = resolveSemanticTarget(artifact, c.target);
    if (r.status === "anchored" && r.node) return r.node.kind;
  }
  return c.target.nodeKind;
}

interface AnchorDisplay {
  kindText: string;
  label: string;
  orphaned: boolean;
}

function anchorDisplay(c: Comment, artifact: SemanticArtifact | undefined): AnchorDisplay | null {
  if (c.target.type !== "semantic") return null;
  let node: SemanticNode | undefined;
  let orphaned = false;
  if (artifact) {
    const r = resolveSemanticTarget(artifact, c.target);
    orphaned = r.status === "orphaned";
    node = r.node;
  }
  if (node) {
    return { kindText: kindLabel(node.kind), label: nodeDisplayTitle(node), orphaned };
  }
  const kind = c.target.nodeKind;
  return {
    kindText: kind ? kindLabel(kind) : "Node",
    label: c.target.nodeLabel ?? c.target.semanticNodeId,
    orphaned,
  };
}

export interface ReviewRailProps {
  tourStep: number | null;
  isAddingComment: boolean;
  setIsAddingComment: (val: boolean) => void;
  /** Text-selection quote preview (Source tab gesture). */
  selectedText: string;
  /** Canvas-click gesture pending anchoring (brief §3) — takes precedence
   *  over `selectedText` in the composer preview when both would apply
   *  (DecisionRoomApp keeps them mutually exclusive in practice). */
  pendingSemanticAnchor: NonNullable<CommentGesture["semantic"]> | null;
  handleAddComment: (e: React.FormEvent) => void;
  commentText: string;
  setCommentText: (val: string) => void;
  commentFeedbackType: Comment["feedbackType"];
  setCommentFeedbackType: (val: Comment["feedbackType"]) => void;
  comments: Comment[];
  selectedCommentId: string | null;
  setSelectedCommentId: (val: string | null) => void;
  replyDrafts: Record<string, string>;
  setReplyDrafts: (val: React.SetStateAction<Record<string, string>>) => void;
  handleAddReply: (e: React.FormEvent, commentId: string) => void;
  currentUser: { name: string; role: string } | null;
  handleResolveComment: (commentId: string) => void;
  /** For live node-kind/label resolution (grouping + anchor chips). Undefined
   *  is handled gracefully (falls back to each target's creation snapshot). */
  artifact: SemanticArtifact | undefined;
}

export default function ReviewRail({
  tourStep,
  isAddingComment,
  setIsAddingComment,
  selectedText,
  pendingSemanticAnchor,
  handleAddComment,
  commentText,
  setCommentText,
  commentFeedbackType,
  setCommentFeedbackType,
  comments,
  selectedCommentId,
  setSelectedCommentId,
  replyDrafts,
  setReplyDrafts,
  handleAddReply,
  currentUser,
  handleResolveComment,
  artifact,
}: ReviewRailProps) {
  const [activeFilters, setActiveFilters] = useState<ReadonlySet<ReviewFilterKey>>(new Set());

  const toggleFilter = (key: ReviewFilterKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groupOf = useMemo(
    () => (c: Comment): ReviewGroup => groupOfComment(c, kindOf(c, artifact)),
    [artifact]
  );

  const buckets = useMemo(() => {
    const ctx: ReviewFilterCtx = { currentUserName: currentUser?.name ?? "", groupOf };
    const filters = [...activeFilters];
    const map = new Map<ReviewGroup, Comment[]>(REVIEW_GROUP_ORDER.map((g) => [g, []]));
    for (const c of comments) {
      if (!filters.every((f) => REVIEW_FILTER_PREDICATES[f](c, ctx))) continue;
      map.get(groupOf(c))!.push(c);
    }
    return map;
  }, [comments, activeFilters, groupOf, currentUser]);

  const totalVisible = REVIEW_GROUP_ORDER.reduce((n, g) => n + (buckets.get(g)?.length ?? 0), 0);

  return (
    <aside
      id="tour-right-collab"
      className={`pane-right-sidebar dr-rail transition-all ${
        tourStep === 3 ? "dr-rail-tour" : ""
      }`}
    >
      <div className="pane-right-sidebar-scroll dr-rail-scroll">
        {isAddingComment && (
          <div className="dr-rail-composer">
            <div className="dr-rail-composer-header">
              <span className="dr-rail-composer-title">
                <Plus className="h-4 w-4" />
                New Comment
              </span>
              <button
                onClick={() => setIsAddingComment(false)}
                className="dr-nav-icon-btn"
                type="button"
                aria-label="Cancel comment"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {pendingSemanticAnchor ? (
              <div className="dr-rail-anchor-preview">
                <span className="dr-rail-anchor-preview-label">Commenting on</span>
                <span className="dr-rail-anchor-preview-value">
                  {pendingSemanticAnchor.nodeLabel ?? pendingSemanticAnchor.semanticNodeId}
                </span>
              </div>
            ) : selectedText ? (
              <div className="dr-rail-anchor-preview">
                <span className="dr-rail-anchor-preview-label">Highlighted context</span>
                <div className="dr-rail-anchor-preview-quote">&ldquo;{selectedText}&rdquo;</div>
              </div>
            ) : null}

            <form onSubmit={handleAddComment} className="dr-rail-composer-form">
              <textarea
                required
                data-testid="comment-body-input"
                className="dr-rail-textarea"
                placeholder="Type your comment... Use @name for mentions"
                rows={3}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <div className="dr-rail-composer-actions">
                <select
                  data-testid="comment-feedback-type"
                  value={commentFeedbackType || ""}
                  onChange={(e) => setCommentFeedbackType((e.target.value || null) as Comment["feedbackType"])}
                  className="dr-select dr-rail-feedback-select"
                >
                  <option value="">General (No Badge)</option>
                  <option value="question">Question</option>
                  <option value="approve">Approval</option>
                  <option value="flag">Flag risk</option>
                  <option value="needs">Needs Data</option>
                </select>
                <button type="submit" data-testid="comment-submit-button" className="dr-rail-post-btn">
                  Post
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="dr-rail-filterbar">
          {FILTER_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleFilter(key)}
              className={`dr-rail-filter-btn ${activeFilters.has(key) ? "dr-rail-filter-btn-active" : ""}`}
            >
              {FILTER_LABEL[key]}
            </button>
          ))}
        </div>

        <div className="dr-rail-groups">
          {totalVisible === 0 ? (
            <div className="dr-rail-empty">No discussion threads active.</div>
          ) : (
            REVIEW_GROUP_ORDER.map((group) => {
              const items = buckets.get(group) ?? [];
              if (items.length === 0) return null;
              return (
                <section key={group} className="dr-rail-group">
                  <h4 className="dr-rail-group-header">
                    {REVIEW_GROUP_LABEL[group]}
                    <span className="dr-rail-group-count">{items.length}</span>
                  </h4>
                  <div className="dr-rail-group-cards">
                    {items.map((comment) => {
                      const anchor = anchorDisplay(comment, artifact);
                      const isSelected = selectedCommentId === comment.id;
                      return (
                        <div
                          key={comment.id}
                          id={`sidebar-comment-${comment.id}`}
                          data-testid="comment-item"
                          data-comment-id={comment.id}
                          {...(comment.target.type === "semantic"
                            ? { "data-comment-target-node-id": comment.target.semanticNodeId }
                            : {})}
                          className={`dr-rail-card ${isSelected ? "dr-rail-card-active" : ""}`}
                          onClick={() => setSelectedCommentId(comment.id)}
                        >
                          <div className="dr-rail-card-header">
                            <div className="dr-rail-card-author">
                              <span className="dr-rail-card-author-name">{comment.author}</span>
                              <span className="dr-rail-card-time">
                                {new Date(comment.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <div className="dr-rail-card-badges">
                              {comment.feedbackType && (
                                <span className={`dr-comment-badge dr-comment-badge-${comment.feedbackType}`}>
                                  {FEEDBACK_BADGE_LABEL[comment.feedbackType]}
                                </span>
                              )}
                              <span
                                className={`dr-comment-badge-lifecycle ${
                                  comment.lifecycle === "resolved" ? "dr-comment-badge-lifecycle-resolved" : ""
                                }`}
                              >
                                {comment.lifecycle}
                              </span>
                            </div>
                          </div>

                          {anchor ? (
                            <div className={`dr-rail-anchor-chip ${anchor.orphaned ? "dr-rail-anchor-chip-orphaned" : ""}`}>
                              <span className="dr-rail-anchor-chip-kind">{anchor.kindText}</span>
                              {anchor.label}
                            </div>
                          ) : comment.target.type === "text" ? (
                            <div className="dr-rail-anchor-chip dr-rail-anchor-chip-text">
                              &ldquo;{comment.target.quote}&rdquo;
                            </div>
                          ) : null}

                          <p className="dr-rail-card-body">{comment.body}</p>

                          {comment.replies.length > 0 && (
                            <div className="dr-rail-replies">
                              {comment.replies.map((reply) => (
                                <div key={reply.id} className="dr-rail-reply">
                                  <div className="dr-rail-reply-meta">
                                    <span className="dr-rail-reply-author">{reply.author}</span>
                                    <span className="dr-rail-reply-time">
                                      {new Date(reply.ts).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </div>
                                  <p className="dr-rail-reply-body">{reply.body}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {comment.lifecycle === "resolved" && comment.resolution && (
                            <div className="dr-rail-resolved-meta">
                              {comment.resolution.resolvedInVersion !== undefined
                                ? `Resolved in v${comment.resolution.resolvedInVersion}`
                                : "Resolved"}
                              {comment.resolution.changeLink && (
                                <details className="dr-rail-changelink">
                                  <summary>View change</summary>
                                  <div className="dr-rail-changelink-before">
                                    <span className="dr-rail-changelink-label">Before</span>
                                    {comment.resolution.changeLink.before}
                                  </div>
                                  <div className="dr-rail-changelink-after">
                                    <span className="dr-rail-changelink-label">After</span>
                                    {comment.resolution.changeLink.after}
                                  </div>
                                </details>
                              )}
                            </div>
                          )}

                          {isSelected && (
                            <div className="dr-rail-reply-panel" onClick={(e) => e.stopPropagation()}>
                              <form
                                onSubmit={(e) => handleAddReply(e, comment.id)}
                                className="dr-rail-reply-form"
                              >
                                <input
                                  type="text"
                                  className="dr-rail-reply-input"
                                  placeholder="Type reply..."
                                  value={replyDrafts[comment.id] || ""}
                                  onChange={(e) =>
                                    setReplyDrafts((prev) => ({ ...prev, [comment.id]: e.target.value }))
                                  }
                                />
                                <button type="submit" className="dr-rail-reply-send" aria-label="Send reply">
                                  <Send className="h-3.5 w-3.5" />
                                </button>
                              </form>

                              {currentUser && currentUser.role !== "viewer" && (
                                <button
                                  onClick={() => handleResolveComment(comment.id)}
                                  className="dr-rail-resolve-btn"
                                  type="button"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  {comment.lifecycle === "open" ? "Mark Resolved" : "Reopen Thread"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
