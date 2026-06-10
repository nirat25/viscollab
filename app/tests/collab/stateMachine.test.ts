import { describe, it, expect } from 'vitest';
import { CollabDoc } from '../../src/collab/index.js';

describe('CollabDoc State Machine & Section Splicing', () => {
  // Test State Flow (Draft -> Live, Live edits fork to Draft)
  it('should transition correctly from Draft to Live, and clone to a new Draft on edits', () => {
    const doc = new CollabDoc('<div>Initial Content</div>');
    expect(doc.currentState).toBe('Draft');
    expect(doc.versions.length).toBe(1);

    // Promote to Live
    doc.promoteToLive();
    expect(doc.currentState).toBe('Live');
    expect(doc.versions[0].status).toBe('Live');

    // Trying to promote again should throw
    expect(() => doc.promoteToLive()).toThrow();

    // Create a new draft from Live
    doc.createNewVersionDraft();
    expect(doc.currentState).toBe('Draft');
    expect(doc.versions.length).toBe(2);
    expect(doc.versions[1].status).toBe('Draft');
    expect(doc.getCurrentHtml()).toBe('<div>Initial Content</div>');
  });

  // Test Immutability Enforcement
  it('should prevent direct modifications to Live document or Live versions', () => {
    const doc = new CollabDoc('<div>Initial</div>');
    doc.promoteToLive();

    expect(() => doc.updateHtml('<div>Modified</div>')).toThrow(/Immutability Enforcement/);
    expect(() => doc.regenerate('<div>Regenerated</div>')).toThrow(/Cannot regenerate/);
  });

  // Test Discard Draft Cleanup
  it('should discard draft and revert to Live version intact', () => {
    const doc = new CollabDoc('<div>Initial</div>');
    doc.promoteToLive(); // V1 is Live
    doc.createNewVersionDraft(); // V2 is Draft
    doc.updateHtml('<div>Modified in draft</div>');

    expect(doc.currentState).toBe('Draft');
    expect(doc.versions.length).toBe(2);
    expect(doc.getCurrentHtml()).toBe('<div>Modified in draft</div>');

    // Discard draft
    doc.discardDraft();
    expect(doc.currentState).toBe('Live');
    expect(doc.versions.length).toBe(1);
    expect(doc.getCurrentHtml()).toBe('<div>Initial</div>');
  });

  // Test Stale Version Edits (Concurrency Control)
  it('should reject edits if sequence is stale', () => {
    const doc = new CollabDoc('<div>Initial</div>');
    expect(doc.sequence).toBe(1);

    // Successful update
    doc.updateHtml('<div>Modified</div>', 1);
    expect(doc.sequence).toBe(2);

    // Stale update (using sequence 1 when it is now 2)
    expect(() => doc.updateHtml('<div>Stale</div>', 1)).toThrow(/Conflict error: Stale version edit/);
    expect(() => doc.regenerate('<div>Stale Reg</div>', 1)).toThrow(/Conflict error: Stale version edit/);
  });

  // Test Section Locking & Splicing Containment
  it('should preserve locked section subtrees identically during regeneration', () => {
    const oldHtml = `
      <div id="root">
        <section id="s1" class="active">
          <h2>Section 1 Title</h2>
          <p>This is locked paragraph content.</p>
          <!-- html comment inside locked section -->
        </section>
        <section id="s2">
          <h2>Section 2 Title</h2>
          <p>Unchanged or modified content.</p>
        </section>
      </div>
    `;

    const newHtml = `
      <div id="root">
        <section id="s1" class="inactive">
          <h2>LLM Rewritten Title</h2>
          <p>This content was modified by LLM and should be overwritten by splice.</p>
        </section>
        <section id="s2">
          <h2>Section 2 Title</h2>
          <p>LLM modified Section 2 content.</p>
        </section>
      </div>
    `;

    const doc = new CollabDoc(oldHtml);
    doc.lockSection('s1');

    doc.regenerate(newHtml);

    const resultHtml = doc.getCurrentHtml();
    
    // Parse result and assert section 1 is structurally/textually identical to oldHtml version
    // while section 2 has the newHtml content.
    expect(resultHtml).toContain('class="active"');
    expect(resultHtml).toContain('<h2>Section 1 Title</h2>');
    expect(resultHtml).toContain('<!-- html comment inside locked section -->');
    expect(resultHtml).toContain('LLM modified Section 2 content.');
    expect(resultHtml).not.toContain('class="inactive"');
    expect(resultHtml).not.toContain('<h2>LLM Rewritten Title</h2>');
  });

  // Test Splicing missing parent restoration
  it('should restore missing locked section under its parent if parent exists', () => {
    const oldHtml = `
      <div id="parent-container">
        <section id="s1">Locked Section 1</section>
      </div>
    `;
    const newHtml = `
      <div id="parent-container">
        <!-- Section 1 was omitted entirely by LLM -->
      </div>
    `;

    const doc = new CollabDoc(oldHtml);
    doc.lockSection('s1');
    doc.regenerate(newHtml);

    const resultHtml = doc.getCurrentHtml();
    expect(resultHtml).toContain('id="parent-container"');
    expect(resultHtml).toContain('id="s1"');
    expect(resultHtml).toContain('Locked Section 1');
  });

  // Test Soft-deletes & Cascade
  it('should cascade soft-delete to replies and notifications when comment is archived', () => {
    const doc = new CollabDoc('<div>Content</div>');
    
    // Add comment, reply, and notification
    doc.addComment('c1', 's1', 'A comment');
    doc.addReply('r1', 'c1', 'A reply');
    doc.addNotification('n1', 'u1', 'New comment notification', 'c1');
    doc.addNotification('n2', 'u2', 'New reply notification', undefined, 'r1');

    expect(doc.comments[0].isArchived).toBe(false);
    expect(doc.replies[0].isArchived).toBe(false);
    expect(doc.notifications[0].isArchived).toBe(false);
    expect(doc.notifications[1].isArchived).toBe(false);

    // Archive the comment
    doc.archiveComment('c1');

    expect(doc.comments[0].isArchived).toBe(true);
    expect(doc.replies[0].isArchived).toBe(true);
    // Notification for comment and notification for reply should both be archived
    expect(doc.notifications[0].isArchived).toBe(true);
    expect(doc.notifications[1].isArchived).toBe(true);
  });

  // Test soft-deletes cascade when sections are deleted
  it('should soft-delete comments when the section they are anchored to is deleted', () => {
    const oldHtml = `
      <div>
        <section id="s1">Section 1</section>
        <section id="s2">Section 2</section>
      </div>
    `;
    const newHtml = `
      <div>
        <section id="s2">Section 2</section>
      </div>
    `; // s1 is deleted

    const doc = new CollabDoc(oldHtml);
    doc.addComment('c1', 's1', 'Comment on section 1');
    doc.addComment('c2', 's2', 'Comment on section 2');

    expect(doc.comments[0].isArchived).toBe(false);
    expect(doc.comments[1].isArchived).toBe(false);

    // Regenerate (s1 is not locked, so it will be deleted)
    doc.regenerate(newHtml);

    // Comment c1 should be archived because section s1 was deleted
    expect(doc.comments[0].isArchived).toBe(true);
    // Comment c2 should remain active
    expect(doc.comments[1].isArchived).toBe(false);
  });
});
