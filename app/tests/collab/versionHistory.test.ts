/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CollabDoc } from '../../src/collab/stateMachine.js';
import {
  addComment as addRichComment,
  getComments,
  resetState,
  addReply as addRichReply
} from '../../src/collab/comments.js';

describe('Version Rollback & History (restoreVersion)', () => {
  beforeEach(() => {
    resetState();
  });

  it('should throw an error when restoring a non-existent version', () => {
    const doc = new CollabDoc('<p>Initial</p>');
    expect(() => doc.restoreVersion(99)).toThrow(/Version 99 not found/);
  });

  it('should reproduce historical content exactly upon rollback', () => {
    const doc = new CollabDoc('<p>Version 1 Content</p>');
    doc.promoteToLive(); // V1 Live

    doc.createNewVersionDraft(); // V2 Draft
    doc.updateHtml('<p>Version 2 Content</p>');
    doc.promoteToLive(); // V2 Live

    // Restore V1
    doc.restoreVersion(1);

    expect(doc.currentState).toBe('Draft');
    expect(doc.versions.length).toBe(3);
    expect(doc.getCurrentVersion().versionNumber).toBe(3);
    expect(doc.getCurrentHtml()).toBe('<p>Version 1 Content</p>');
  });

  it('should manage section-level comment archiving/restoration on internal comments', () => {
    const doc = new CollabDoc(`
      <div>
        <section id="s1">Section 1</section>
        <section id="s2">Section 2</section>
      </div>
    `);

    doc.addComment('c1', 's1', 'Internal Comment 1');
    doc.addComment('c2', 's2', 'Internal Comment 2');

    expect(doc.comments[0].isArchived).toBe(false);
    expect(doc.comments[1].isArchived).toBe(false);

    // Promote V1 and create V2 draft with section s1 removed
    doc.promoteToLive();
    doc.createNewVersionDraft();
    doc.updateHtml(`
      <div>
        <section id="s2">Section 2</section>
      </div>
    `); // s1 is deleted

    expect(doc.comments[0].isArchived).toBe(true); // s1 deleted -> archived
    expect(doc.comments[1].isArchived).toBe(false);

    doc.promoteToLive(); // V2 Live

    // Restore V1 which has both sections
    doc.restoreVersion(1);

    expect(doc.comments[0].isArchived).toBe(false); // restored s1 -> unarchived!
    expect(doc.comments[1].isArchived).toBe(false);
  });

  it('should clone and re-anchor rich comments from comments.ts onto the new version', () => {
    // V1 HTML
    const doc = new CollabDoc('<p>Apple Banana Orange</p>');
    
    // Add rich comments targeting "Banana" and "Orange" on v1
    const commentBanana = addRichComment(
      { type: 'text', quote: 'Banana', prefix: 'Apple ', suffix: ' Orange' },
      'Comment on Banana',
      null,
      'v1'
    );
    addRichReply(commentBanana.id, 'Reply on Banana');

    const commentOrange = addRichComment(
      { type: 'text', quote: 'Orange', prefix: 'Banana ', suffix: '' },
      'Comment on Orange',
      null,
      'v1'
    );

    expect(getComments().length).toBe(2);

    doc.promoteToLive(); // V1 Live

    // V2 Draft: "Banana" is replaced with "Pear"
    doc.createNewVersionDraft();
    doc.updateHtml('<p>Apple Pear Orange</p>');
    doc.promoteToLive(); // V2 Live

    // Restore V1
    doc.restoreVersion(1); // V3 Draft

    const allComments = getComments();
    // Cloned comments should be added
    expect(allComments.length).toBe(4);

    const clonedComments = allComments.filter(c => c.versionId === 'v3');
    expect(clonedComments.length).toBe(2);

    const clonedBanana = clonedComments.find(c => c.target.type === 'text' && c.target.quote === 'Banana');
    expect(clonedBanana).toBeDefined();
    expect(clonedBanana!.anchorStatus).toBe('anchored');
    expect(clonedBanana!.posStart).toBe(6);
    expect(clonedBanana!.posEnd).toBe(12);
    expect(clonedBanana!.replies.length).toBe(1);
    expect(clonedBanana!.replies[0].body).toBe('Reply on Banana');
    expect(clonedBanana!.history.some(h => h.event.includes('cloned from version v1 during rollback'))).toBe(true);

    const clonedOrange = clonedComments.find(c => c.target.type === 'text' && c.target.quote === 'Orange');
    expect(clonedOrange).toBeDefined();
    expect(clonedOrange!.anchorStatus).toBe('anchored');
    expect(clonedOrange!.posStart).toBe(13);
    expect(clonedOrange!.posEnd).toBe(19);
  });
});

describe('Visual HTML Diffing (getDiffHtml)', () => {
  it('should throw an error for non-existent versions', () => {
    const doc = new CollabDoc('<p>Initial</p>');
    expect(() => doc.getDiffHtml(1, 2)).toThrow(/Version.*not found/);
  });

  it('should wrap text additions in ins and deletions in del', () => {
    const doc = new CollabDoc('<p>Hello World</p>');
    doc.promoteToLive();
    doc.createNewVersionDraft();
    doc.updateHtml('<p>Hello Amazing World</p>');
    doc.promoteToLive();

    const diff = doc.getDiffHtml(1, 2);
    expect(diff).toContain('<p>Hello <ins>Amazing </ins>World</p>');
  });

  it('should wrap text deletions in del', () => {
    const doc = new CollabDoc('<p>Hello Amazing World</p>');
    doc.promoteToLive();
    doc.createNewVersionDraft();
    doc.updateHtml('<p>Hello World</p>');
    doc.promoteToLive();

    const diff = doc.getDiffHtml(1, 2);
    expect(diff).toContain('<p>Hello <del>Amazing </del>World</p>');
  });

  it('should perform structural cell-level diffs on tables', () => {
    const htmlV1 = `
      <table>
        <tr>
          <td>Row 1 Cell 1</td>
          <td>Row 1 Cell 2</td>
        </tr>
      </table>
    `;
    const htmlV2 = `
      <table>
        <tr>
          <td>Row 1 Cell 1 Mod</td>
          <td>Row 1 Cell 2</td>
        </tr>
      </table>
    `;

    const doc = new CollabDoc(htmlV1);
    doc.promoteToLive();
    doc.createNewVersionDraft();
    doc.updateHtml(htmlV2);
    doc.promoteToLive();

    const diff = doc.getDiffHtml(1, 2);
    expect(diff).toContain('<td>Row 1 Cell 1<ins> Mod</ins></td>');
    expect(diff).toContain('<td>Row 1 Cell 2</td>');
  });

  it('should perform structural item-level diffs on lists', () => {
    const htmlV1 = `
      <ul>
        <li>Apple</li>
        <li>Banana</li>
      </ul>
    `;
    const htmlV2 = `
      <ul>
        <li>Apple</li>
        <li>Pear</li>
      </ul>
    `;

    const doc = new CollabDoc(htmlV1);
    doc.promoteToLive();
    doc.createNewVersionDraft();
    doc.updateHtml(htmlV2);
    doc.promoteToLive();

    const diff = doc.getDiffHtml(1, 2);
    expect(diff).toContain('<li>Apple</li>');
    expect(diff).toContain('<li><del>Banana</del><ins>Pear</ins></li>');
  });
});
