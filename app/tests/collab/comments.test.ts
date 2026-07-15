/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  addComment,
  addReply,
  resolveComment,
  reopenComment,
  deleteComment,
  locate,
  getComments,
  getNotifications,
  resetState,
  setCurrentUser,
  setVerdict,
  getVerdicts,
  escapeHTML,
  parseMentions,
  handleAutocompleteSelect,
  elHash,
  resolveSemanticTarget,
  type Comment,
  type SemanticCommentTarget
} from '../../src/collab/comments.js';
import type { SemanticArtifact, SemanticNode, RiskNode } from '../../src/semantic/types.js';

function createDoc(html: string) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('DOM-Anchored Commenting Thread CRUD', () => {
  beforeEach(() => {
    resetState();
  });

  it('should support comment and reply addition, resolution, and reopening', () => {
    setCurrentUser('Alex');
    const comment = addComment(
      { type: 'text', quote: 'Vendor A', prefix: '', suffix: '' },
      'This is a comment'
    );
    expect(comment.author).toBe('Alex');
    expect(comment.body).toBe('This is a comment');
    expect(comment.lifecycle).toBe('open');
    expect(getComments().length).toBe(1);

    // Add a reply
    setCurrentUser('Nirat');
    const reply = addReply(comment.id, 'This is a reply');
    expect(reply.author).toBe('Nirat');
    expect(reply.body).toBe('This is a reply');
    expect(comment.replies.length).toBe(1);

    // Resolve comment
    setCurrentUser('Alex');
    resolveComment(comment.id);
    expect(comment.lifecycle).toBe('resolved');
    expect(comment.resolution?.resolvedBy).toBe('Alex');

    // Reopen comment
    reopenComment(comment.id);
    expect(comment.lifecycle).toBe('open');
    expect(comment.resolution).toBeNull();
  });

  it('should support self-mention suppression', () => {
    setCurrentUser('Alex');
    const comment = addComment(
      { type: 'text', quote: 'Vendor A', prefix: '', suffix: '' },
      'Paging @nirat and @alex'
    );

    const notifications = getNotifications();
    const alexNotifications = notifications.filter(n => n.to === 'alex');
    const niratNotifications = notifications.filter(n => n.to === 'nirat');

    expect(alexNotifications.length).toBe(0);
    expect(niratNotifications.length).toBe(1);
    expect(niratNotifications[0].commentId).toBe(comment.id);
  });

  it('should cascade-delete all notifications referencing a deleted comment/thread', () => {
    setCurrentUser('Alex');
    const comment = addComment(
      { type: 'text', quote: 'Vendor A', prefix: '', suffix: '' },
      'Paging @nirat and @sam'
    );
    addReply(comment.id, 'Adding @priya');

    expect(getNotifications().length).toBe(3);

    deleteComment(comment.id);
    expect(getComments().length).toBe(0);
    expect(getNotifications().length).toBe(0);
  });

  it('should sanitize HTML inputs for comments and replies to prevent XSS', () => {
    setCurrentUser('Alex');
    const maliciousBody = 'Hello <script>alert("XSS")</script><img src="x" onerror="alert(1)">';
    const comment = addComment(
      { type: 'text', quote: 'Vendor A', prefix: '', suffix: '' },
      maliciousBody
    );
    expect(comment.body).not.toContain('<script>');
    expect(comment.body).toBe(escapeHTML(maliciousBody));

    const reply = addReply(comment.id, maliciousBody);
    expect(reply.body).not.toContain('<script>');
    expect(reply.body).toBe(escapeHTML(maliciousBody));
  });

  it('should manage user roster sign-off verdicts correctly', () => {
    setVerdict('Alex', 'approve');
    setVerdict('Nirat', 'changes');
    setVerdict('Sam', 'block');

    const verdicts = getVerdicts();
    expect(verdicts['Alex']).toBe('approve');
    expect(verdicts['Nirat']).toBe('changes');
    expect(verdicts['Sam']).toBe('block');
  });

  it('should handle autocomplete user selection updates, focus, and cursor correctly', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'Ping @ni';
    textarea.selectionStart = textarea.selectionEnd = 8;
    document.body.appendChild(textarea);

    handleAutocompleteSelect(textarea, 'Nirat');

    expect(textarea.value).toBe('Ping @Nirat ');
    expect(textarea.selectionStart).toBe(12);
    expect(document.activeElement).toBe(textarea);

    document.body.removeChild(textarea);
  });
});

describe('DOM-Anchored Commenting Anchoring (locate)', () => {
  beforeEach(() => {
    resetState();
  });

  it('should locate exact text matches in the DOM', () => {
    const doc = createDoc('<p>Consolidate the three analytics vendors onto Vendor A this quarter.</p>');
    const c = addComment(
      { type: 'text', quote: 'Vendor A', prefix: 'onto ', suffix: ' this' },
      'Comment on Vendor A'
    );

    const res = locate(doc, c);
    expect(res.status).toBe('anchored');
    expect(res.start).toBe(45);
    expect(res.end).toBe(53);
  });

  it('should resolve overlapping and nested highlights correctly', () => {
    const doc = createDoc('<p>Consolidate the three analytics vendors onto Vendor A this quarter.</p>');

    const c1 = addComment(
      { type: 'text', quote: 'Vendor A', prefix: 'onto ', suffix: ' this' },
      'Comment 1'
    );
    const c2 = addComment(
      { type: 'text', quote: 'Vendor A this quarter', prefix: 'onto ', suffix: '.' },
      'Comment 2'
    );
    const c3 = addComment(
      { type: 'text', quote: 'analytics vendors', prefix: 'three ', suffix: ' onto' },
      'Comment 3'
    );

    const res1 = locate(doc, c1);
    const res2 = locate(doc, c2);
    const res3 = locate(doc, c3);

    expect(res1.status).toBe('anchored');
    expect(res1.start).toBe(45);
    expect(res1.end).toBe(53);

    expect(res2.status).toBe('anchored');
    expect(res2.start).toBe(45);
    expect(res2.end).toBe(66);

    expect(res3.status).toBe('anchored');
    expect(res3.start).toBe(22);
    expect(res3.end).toBe(39);
  });

  it('should support multi-occurrence disambiguation via prefix/suffix context', () => {
    const doc = createDoc('<p>First is Vendor A and second is Vendor A and third is Vendor A.</p>');

    const c = addComment(
      { type: 'text', quote: 'Vendor A', prefix: 'second is ', suffix: ' and third' },
      'Comment on second Vendor A'
    );

    const resBefore = locate(doc, c);
    expect(resBefore.status).toBe('anchored');
    expect(resBefore.start).toBe(32);
    expect(resBefore.end).toBe(40);

    const docEdited = createDoc('<p>First is Vendor B and second is Vendor A and third is Vendor A.</p>');

    const resAfter = locate(docEdited, c);
    expect(resAfter.status).toBe('anchored');
    expect(resAfter.start).toBe(32);
    expect(resAfter.end).toBe(40);
  });

  it('should locate stale anchors with inline modifications using diff-match-patch and capture before/after text', () => {
    const doc = createDoc('<p>It cuts cost ~46% this quarter.</p>');
    const c = addComment(
      { type: 'text', quote: 'cuts cost ~46%', prefix: '', suffix: '' },
      'Fuzzy comment',
      null,
      'v1',
      3,
      17
    );

    const docEdited = createDoc('<p>It cuts cost ~52% this quarter.</p>');

    const res = locate(docEdited, c);
    expect(res.status).toBe('stale');
    expect(res.start).toBe(3);
    expect(res.end).toBe(17);
    expect(res.newText).toBe('cuts cost ~52%');
    expect(res.fuzzy).toBeGreaterThanOrEqual(0.6);

    resolveComment(c.id, { before: c.target.type === 'text' ? c.target.quote : '', after: res.newText || '' });
    expect(c.lifecycle).toBe('resolved');
    expect(c.resolution?.changeLink?.before).toBe('cuts cost ~46%');
    expect(c.resolution?.changeLink?.after).toBe('cuts cost ~52%');
  });

  it('should handle zero-width spaces and normalize whitespace during anchoring', () => {
    const doc = createDoc('<p>Vendor\u200b  A</p>');

    const c = addComment(
      { type: 'text', quote: 'Vendor A', prefix: '', suffix: '' },
      'Comment with spacing issues'
    );

    const res = locate(doc, c);
    expect(res.status).toBe('anchored');
    expect(res.start).toBe(0);
    expect(res.end).toBe(10);
    expect(doc.textContent?.slice(res.start, res.end)).toBe('Vendor\u200b  A');
  });

  it('should persist anchoring across inline formatting shifts (bold, link, italics)', () => {
    const doc = createDoc('<p>Consolidate to Vendor A this quarter.</p>');
    const c = addComment(
      { type: 'text', quote: 'Vendor A', prefix: 'Consolidate to ', suffix: ' this' },
      'Bold test'
    );

    const docBold = createDoc('<p>Consolidate to <b>Vendor A</b> this quarter.</p>');
    const resBold = locate(docBold, c);
    expect(resBold.status).toBe('anchored');

    const docLink = createDoc('<p>Consolidate to <a href="#">Vendor <i>A</i></a> this quarter.</p>');
    const resLink = locate(docLink, c);
    expect(resLink.status).toBe('anchored');
  });

  it('should locate element targets by ID, Path, or Hash, and handle fallbacks and orphans', () => {
    const doc = createDoc(`
      <div>
        <table id="opt-table">
          <tr><th>Option</th><th>Cost</th></tr>
          <tr id="row2"><td>Vendor A</td><td>$130k</td></tr>
        </table>
        <img id="logo" src="logo.png" />
      </div>
    `);

    const row = doc.querySelector('#row2');
    const c = addComment(
      {
        type: 'element',
        id: 'row2',
        path: 'table:nth-of-type(1)>tr:nth-of-type(2)',
        hash: elHash(row),
        tag: 'tr',
        snippet: 'Vendor A $130k'
      },
      'Comment on row'
    );

    const res1 = locate(doc, c);
    expect(res1.status).toBe('anchored');
    expect(res1.el).toBe(row);

    const docNoId = createDoc(`
      <div>
        <table id="opt-table">
          <tr><th>Option</th><th>Cost</th></tr>
          <tr><td>Vendor A</td><td>$130k</td></tr>
        </table>
      </div>
    `);
    const res2 = locate(docNoId, c);
    expect(res2.status).toBe('anchored');
    expect(res2.el?.tagName.toLowerCase()).toBe('tr');

    const docNewPath = createDoc(`
      <div>
        <div>Banner</div>
        <table id="opt-table">
          <tr><th>Option</th><th>Cost</th></tr>
          <tr id="row2"><td>Vendor A</td><td>$130k</td></tr>
        </table>
      </div>
    `);
    const rowEl = docNewPath.querySelector('#row2');
    rowEl?.removeAttribute('id');
    const res3 = locate(docNewPath, c);
    expect(res3.status).toBe('anchored');
    expect(elHash(res3.el)).toBe((c.target as any).hash);

    const docChangedText = createDoc(`
      <div>
        <table id="opt-table">
          <tr><th>Option</th><th>Cost</th></tr>
          <tr id="row2"><td>Vendor A</td><td>$140k</td></tr>
        </table>
      </div>
    `);
    const res4 = locate(docChangedText, c);
    expect(res4.status).toBe('stale');
    expect(res4.el?.id).toBe('row2');

    const docOrphaned = createDoc(`
      <div>
        <img id="logo" src="logo.png" />
      </div>
    `);
    const res5 = locate(docOrphaned, c);
    expect(res5.status).toBe('orphaned');
  });

  it('should support fuzzy matching for patterns longer than 32 characters without throwing', () => {
    const doc = createDoc('<p>Engineering currently runs three overlapping analytics vendors. Consolidating onto Vendor A this quarter eliminates redundancy and reduces integration overhead.</p>');

    const quote = 'three overlapping analytics vendors. Consolidating onto Vendor A';
    const c = addComment(
      { type: 'text', quote, prefix: 'runs ', suffix: ' this' },
      'Comment on long quote'
    );

    const resExact = locate(doc, c);
    expect(resExact.status).toBe('anchored');

    const docEdited = createDoc('<p>Engineering currently runs three overlapping analytics vendors. Merging onto Vendor A this quarter eliminates redundancy and reduces integration overhead.</p>');

    const resFuzzy = locate(docEdited, c);
    expect(resFuzzy.status).toBe('stale');
    expect(resFuzzy.newText).toContain('overlapping analytics vendors. Merging onto Vendor A');
  });
});

describe('Semantic comment targets (Phase 7, COLLAB-001)', () => {
  beforeEach(() => {
    resetState();
  });

  function makeRiskNode(id: string): RiskNode {
    return {
      id,
      kind: 'risk',
      title: 'Vendor lock-in',
      summary: 'Consolidating onto one vendor increases switching cost.',
      sourceRefs: [],
      sourceStatus: 'explicit'
    };
  }

  function makeArtifact(id: string, nodes: SemanticNode[]): Pick<SemanticArtifact, 'id' | 'nodes'> {
    return { id, nodes };
  }

  it('resolves an anchored semantic target when the node exists in the live artifact', () => {
    const artifact = makeArtifact('art1', [makeRiskNode('risk_1'), makeRiskNode('risk_2')]);
    const target: SemanticCommentTarget = {
      type: 'semantic',
      artifactId: 'art1',
      semanticNodeId: 'risk_2'
    };

    const res = resolveSemanticTarget(artifact, target);
    expect(res.status).toBe('anchored');
    expect(res.node?.id).toBe('risk_2');
  });

  it('resolves orphaned when the semantic node id is absent from the artifact', () => {
    const artifact = makeArtifact('art1', [makeRiskNode('risk_1')]);
    const target: SemanticCommentTarget = {
      type: 'semantic',
      artifactId: 'art1',
      semanticNodeId: 'risk_99'
    };

    const res = resolveSemanticTarget(artifact, target);
    expect(res.status).toBe('orphaned');
    expect(res.node).toBeUndefined();
  });

  it('resolves orphaned when artifactId mismatches, regardless of node presence', () => {
    const artifact = makeArtifact('art1', [makeRiskNode('risk_1')]);
    const target: SemanticCommentTarget = {
      type: 'semantic',
      artifactId: 'art-other',
      semanticNodeId: 'risk_1'
    };

    const res = resolveSemanticTarget(artifact, target);
    expect(res.status).toBe('orphaned');
    expect(res.node).toBeUndefined();
  });

  it('locate() returns orphaned for a semantic target without touching the DOM', () => {
    const c: Comment = {
      id: 'c1',
      versionId: 'v1',
      author: 'Alex',
      body: 'Comment on a risk',
      createdAt: Date.now(),
      feedbackType: null,
      lifecycle: 'open',
      anchorStatus: 'anchored',
      target: { type: 'semantic', artifactId: 'art1', semanticNodeId: 'risk_1' },
      lastKnownContext: 'Risk R1',
      resolution: null,
      replies: [],
      mentions: [],
      history: []
    };

    // Passing null as root proves the guard returns before any DOM access.
    const res = locate(null, c);
    expect(res.status).toBe('orphaned');
  });

  it('resolveComment(id, changeLink, versionNumber) records resolvedInVersion and the vN history text', () => {
    setCurrentUser('Alex');
    const comment = addComment(
      { type: 'text', quote: 'Vendor A', prefix: '', suffix: '' },
      'A comment'
    );

    resolveComment(comment.id, { before: 'a', after: 'b' }, 3);

    expect(comment.resolution?.resolvedInVersion).toBe(3);
    expect(comment.resolution?.semanticNodeId).toBeUndefined();
    const lastEvent = comment.history[comment.history.length - 1];
    expect(lastEvent?.event).toBe('resolved (content edited) in v3');
  });

  it('resolveComment sets resolution.semanticNodeId for a semantic-target comment', () => {
    setCurrentUser('Alex');
    const comment = addComment(
      { type: 'semantic', artifactId: 'art1', semanticNodeId: 'risk_2' },
      'A comment on a risk'
    );

    resolveComment(comment.id, null, 5);

    expect(comment.resolution?.resolvedInVersion).toBe(5);
    expect(comment.resolution?.semanticNodeId).toBe('risk_2');
    const lastEvent = comment.history[comment.history.length - 1];
    expect(lastEvent?.event).toBe('resolved (no change) in v5');
  });

  it('resolveComment with no versionNumber leaves the pre-Phase-7 behavior unchanged', () => {
    setCurrentUser('Alex');
    const comment = addComment(
      { type: 'text', quote: 'Vendor A', prefix: '', suffix: '' },
      'A comment'
    );

    resolveComment(comment.id);

    expect(comment.resolution?.resolvedInVersion).toBeUndefined();
    const lastEvent = comment.history[comment.history.length - 1];
    expect(lastEvent?.event).toBe('resolved (no change)');
  });

  it('round-trips a Comment carrying a SemanticCommentTarget through JSON with optional fields set', () => {
    setCurrentUser('Alex');
    const comment = addComment(
      {
        type: 'semantic',
        artifactId: 'art1',
        semanticNodeId: 'risk_2',
        visualBlockId: 'block-3',
        nodeKind: 'risk',
        nodeLabel: 'R2'
      },
      'A comment on a risk'
    );
    resolveComment(comment.id, { before: 'a', after: 'b' }, 2);

    const roundTripped = JSON.parse(JSON.stringify(comment));
    expect(roundTripped).toEqual(comment);
  });

  it('round-trips a Comment carrying a SemanticCommentTarget through JSON with optional fields unset', () => {
    setCurrentUser('Alex');
    const comment = addComment(
      { type: 'semantic', artifactId: 'art1', semanticNodeId: 'risk_2' },
      'A comment on a risk'
    );

    const roundTripped = JSON.parse(JSON.stringify(comment));
    expect(roundTripped).toEqual(comment);
  });
});
