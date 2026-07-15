import { describe, it, expect } from 'vitest';
import {
  groupOfComment,
  REVIEW_FILTER_PREDICATES,
  buildCommentTarget,
  type ReviewFilterCtx,
  type ReviewFilterKey,
  type CommentGesture
} from '../../src/collab/review.js';
import type { Comment } from '../../src/collab/comments.js';
import type { SemanticNodeKind } from '../../src/semantic/types.js';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    versionId: 'v1',
    author: 'Alex',
    body: 'test comment',
    createdAt: Date.now(),
    feedbackType: null,
    lifecycle: 'open',
    anchorStatus: 'anchored',
    target: { type: 'text', quote: 'q', prefix: '', suffix: '' },
    lastKnownContext: 'q',
    resolution: null,
    replies: [],
    mentions: [],
    history: [],
    ...overrides
  };
}

describe('groupOfComment (Phase 7, COLLAB-003 grouping precedence)', () => {
  it('rule 0 — resolved wins, even for a flag on a risk-kind node', () => {
    const c = makeComment({ lifecycle: 'resolved', feedbackType: 'flag' });
    expect(groupOfComment(c, 'risk')).toBe('resolved');
  });

  it('rule 1 — flag feedback escalates an open comment to blockers', () => {
    const c = makeComment({ lifecycle: 'open', feedbackType: 'flag' });
    expect(groupOfComment(c, undefined)).toBe('blockers');
  });

  it('rule 2 — risk or assumption kind groups to risks', () => {
    const c = makeComment();
    expect(groupOfComment(c, 'risk')).toBe('risks');
    expect(groupOfComment(c, 'assumption')).toBe('risks');
  });

  it('rule 3 — question kind groups to questions', () => {
    const c = makeComment();
    expect(groupOfComment(c, 'question')).toBe('questions');
  });

  it('rule 4 — action kind groups to actions', () => {
    const c = makeComment();
    expect(groupOfComment(c, 'action')).toBe('actions');
  });

  it('rule 5 — decision, option, or tradeoff kind groups to decisions', () => {
    const c = makeComment();
    const kinds: SemanticNodeKind[] = ['decision', 'option', 'tradeoff'];
    for (const kind of kinds) {
      expect(groupOfComment(c, kind)).toBe('decisions');
    }
  });

  it('rule 6 — needs feedback with no informative kind falls back to questions', () => {
    const c = makeComment({ feedbackType: 'needs' });
    expect(groupOfComment(c, undefined)).toBe('questions');
  });

  it('rule 6 — question feedback with no informative kind falls back to questions', () => {
    const c = makeComment({ feedbackType: 'question' });
    expect(groupOfComment(c, undefined)).toBe('questions');
  });

  it('general fallback — null feedback and a text target (no kind) groups to decisions', () => {
    const c = makeComment({
      feedbackType: null,
      target: { type: 'text', quote: 'q', prefix: '', suffix: '' }
    });
    expect(groupOfComment(c, undefined)).toBe('decisions');
  });
});

describe('REVIEW_FILTER_PREDICATES (Phase 7, COLLAB-003 filters)', () => {
  function ctxFor(currentUserName: string, kind: SemanticNodeKind | undefined = undefined): ReviewFilterCtx {
    return {
      currentUserName,
      groupOf: (c: Comment) => groupOfComment(c, kind)
    };
  }

  it('unresolved passes open comments and excludes resolved ones', () => {
    expect(REVIEW_FILTER_PREDICATES.unresolved(makeComment({ lifecycle: 'open' }))).toBe(true);
    expect(REVIEW_FILTER_PREDICATES.unresolved(makeComment({ lifecycle: 'resolved' }))).toBe(false);
  });

  it('mine passes when the comment author matches the current user, fails otherwise', () => {
    const ctx = ctxFor('Alex');
    expect(REVIEW_FILTER_PREDICATES.mine(makeComment({ author: 'Alex' }), ctx)).toBe(true);
    expect(REVIEW_FILTER_PREDICATES.mine(makeComment({ author: 'Priya' }), ctx)).toBe(false);
  });

  it('blockers passes when the comment groups to blockers', () => {
    const ctx = ctxFor('Alex');
    const blocker = makeComment({ lifecycle: 'open', feedbackType: 'flag' });
    const nonBlocker = makeComment({ lifecycle: 'open', feedbackType: null });
    expect(REVIEW_FILTER_PREDICATES.blockers(blocker, ctx)).toBe(true);
    expect(REVIEW_FILTER_PREDICATES.blockers(nonBlocker, ctx)).toBe(false);
  });

  it('stale passes both stale and orphaned anchor statuses, fails anchored', () => {
    expect(REVIEW_FILTER_PREDICATES.stale(makeComment({ anchorStatus: 'stale' }))).toBe(true);
    expect(REVIEW_FILTER_PREDICATES.stale(makeComment({ anchorStatus: 'orphaned' }))).toBe(true);
    expect(REVIEW_FILTER_PREDICATES.stale(makeComment({ anchorStatus: 'anchored' }))).toBe(false);
  });

  it('AND combination excludes a comment that passes some but not all active filters', () => {
    const ctx = ctxFor('Alex');
    const activeFilters: ReviewFilterKey[] = ['unresolved', 'mine'];
    const passesAll = (c: Comment) =>
      activeFilters.every((key) => (REVIEW_FILTER_PREDICATES[key] as (c: Comment, ctx: ReviewFilterCtx) => boolean)(c, ctx));

    // Open (passes unresolved) but authored by someone else (fails mine) -> excluded overall.
    const mixed = makeComment({ lifecycle: 'open', author: 'Priya' });
    expect(REVIEW_FILTER_PREDICATES.unresolved(mixed)).toBe(true);
    expect(passesAll(mixed)).toBe(false);

    // Open and mine -> passes both -> included overall.
    const both = makeComment({ lifecycle: 'open', author: 'Alex' });
    expect(passesAll(both)).toBe(true);
  });
});

describe('buildCommentTarget (Phase 7, COLLAB-002 gesture precedence)', () => {
  it('builds a semantic target from a semantic gesture', () => {
    const g: CommentGesture = {
      semantic: { artifactId: 'art1', semanticNodeId: 'risk_2', visualBlockId: 'block-3', nodeKind: 'risk', nodeLabel: 'R2' }
    };
    const target = buildCommentTarget(g);
    expect(target).toEqual({ type: 'semantic', ...g.semantic });
  });

  it('builds a text target from a text-only gesture', () => {
    const g: CommentGesture = { text: { quote: 'Vendor A', prefix: 'onto ', suffix: ' this' } };
    const target = buildCommentTarget(g);
    expect(target).toEqual({ type: 'text', quote: 'Vendor A', prefix: 'onto ', suffix: ' this' });
  });

  it('builds a whole-section element target from a section-only gesture', () => {
    const g: CommentGesture = { section: { id: 'sec-1' } };
    const target = buildCommentTarget(g);
    expect(target).toEqual({
      type: 'element',
      id: 'sec-1',
      path: 'section#sec-1',
      hash: 0,
      tag: 'section',
      snippet: 'Entire section comment'
    });
  });

  it('precedence: semantic beats text beats section when more than one gesture is present', () => {
    const allThree: CommentGesture = {
      semantic: { artifactId: 'art1', semanticNodeId: 'risk_2' },
      text: { quote: 'Vendor A', prefix: '', suffix: '' },
      section: { id: 'sec-1' }
    };
    expect(buildCommentTarget(allThree).type).toBe('semantic');

    const textAndSection: CommentGesture = {
      text: { quote: 'Vendor A', prefix: '', suffix: '' },
      section: { id: 'sec-1' }
    };
    expect(buildCommentTarget(textAndSection).type).toBe('text');
  });

  it('throws on an empty gesture', () => {
    expect(() => buildCommentTarget({})).toThrow('buildCommentTarget: empty gesture');
  });
});
