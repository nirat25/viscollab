import type { Comment, AnchorTarget } from './comments.js';
import type { SemanticNodeId, SemanticNodeKind } from '../semantic/types.js';

/** Fixed display order for the review rail's grouped sections (Phase 7, COLLAB-003). */
export type ReviewGroup =
  | 'blockers' | 'risks' | 'questions' | 'decisions' | 'actions' | 'resolved';

export const REVIEW_GROUP_ORDER: ReviewGroup[] = [
  'blockers', 'risks', 'questions', 'decisions', 'actions', 'resolved',
];
export const REVIEW_GROUP_LABEL: Record<ReviewGroup, string> = {
  blockers: 'Blockers', risks: 'Risks', questions: 'Questions',
  decisions: 'Decisions', actions: 'Actions', resolved: 'Resolved',
};

/** kindOf resolves the live node kind for semantic targets (via resolveSemanticTarget),
 *  else the target's snapshot nodeKind, else undefined. Pure; artifact optional. */
export function groupOfComment(
  c: Comment,
  kind: SemanticNodeKind | undefined
): ReviewGroup {
  if (c.lifecycle === 'resolved') return 'resolved';        // rule 0 — wins
  if (c.feedbackType === 'flag') return 'blockers';         // rule 1 — escalation override
  if (kind === 'risk' || kind === 'assumption') return 'risks';
  if (kind === 'question') return 'questions';
  if (kind === 'action') return 'actions';
  if (kind === 'decision' || kind === 'option' || kind === 'tradeoff') return 'decisions';
  // rule 6 — no informative kind (claim/evidence/stakeholder/text/element target): use feedbackType
  if (c.feedbackType === 'question' || c.feedbackType === 'needs') return 'questions';
  return 'decisions';                                        // general fallback
}

/** Client-side view-state filters — never persisted, never sent to the server (tenet #3). */
export interface ReviewFilterCtx {
  currentUserName: string;
  groupOf: (c: Comment) => ReviewGroup;
}

export const REVIEW_FILTER_PREDICATES = {
  unresolved: (c: Comment) => c.lifecycle === 'open',
  mine:       (c: Comment, ctx: ReviewFilterCtx) => c.author === ctx.currentUserName,
  blockers:   (c: Comment, ctx: ReviewFilterCtx) => ctx.groupOf(c) === 'blockers',
  stale:      (c: Comment) => c.anchorStatus === 'stale' || c.anchorStatus === 'orphaned',
} as const;
export type ReviewFilterKey = keyof typeof REVIEW_FILTER_PREDICATES;

/** The gesture that opened the composer decides the anchor type (COLLAB-002).
 *  Precedence: semantic > text > section. */
export interface CommentGesture {
  semantic?: { artifactId: string; semanticNodeId: SemanticNodeId; visualBlockId?: string;
               nodeKind?: SemanticNodeKind; nodeLabel?: string };
  text?: { quote: string; prefix: string; suffix: string };
  section?: { id: string };            // whole-section element target
}

export function buildCommentTarget(g: CommentGesture): AnchorTarget {
  if (g.semantic) return { type: 'semantic', ...g.semantic };
  if (g.text)     return { type: 'text', ...g.text };
  if (g.section)  return { type: 'element', id: g.section.id,
                           path: `section#${g.section.id}`, hash: 0, tag: 'section',
                           snippet: 'Entire section comment' };
  throw new Error('buildCommentTarget: empty gesture');
}
