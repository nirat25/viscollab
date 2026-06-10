import { parse } from 'node-html-parser';
import { locate, getComments, setComments, type Comment } from './comments.js';
import { diff_match_patch } from 'diff-match-patch';

export type DocState = 'Draft' | 'Live';

export interface DocVersion {
  versionNumber: number;
  html: string;
  status: DocState;
  timestamp: Date;
}

export interface DocComment {
  id: string;
  sectionId: string;
  content: string;
  isArchived: boolean;
}

export interface DocReply {
  id: string;
  commentId: string;
  content: string;
  isArchived: boolean;
}

export interface DocNotification {
  id: string;
  userId: string;
  message: string;
  isRead: boolean;
  isArchived: boolean;
  commentId?: string;
  replyId?: string;
}

export function splicePreservedSections(
  oldHtml: string,
  newHtml: string,
  lockedIds: Set<string>
): string {
  if (lockedIds.size === 0) {
    return newHtml;
  }

  const oldRoot = parse(oldHtml, { comment: true });
  const newRoot = parse(newHtml, { comment: true });

  for (const id of lockedIds) {
    const oldElement = oldRoot.getElementById(id);
    if (!oldElement) {
      continue;
    }

    const newElement = newRoot.getElementById(id);
    if (newElement) {
      newElement.replaceWith(oldElement);
    } else {
      // Reconstruct / insert at parent if parent still exists in newHtml
      const parent = oldElement.parentNode;
      const parentId = parent ? parent.getAttribute('id') : null;
      if (parentId) {
        const newParent = newRoot.getElementById(parentId);
        if (newParent) {
          newParent.appendChild(oldElement);
          continue;
        }
      }
      // Fallback: append to body or container
      const body = newRoot.querySelector('body') || newRoot;
      body.appendChild(oldElement);
    }
  }

  return newRoot.toString();
}

function escapeHTML(str: string): string {
  return str.replace(/[&<>"]/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m] || m));
}

function getDomRoot(html: string): any {
  if (typeof document !== 'undefined') {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
  } else {
    const root = parse(html) as any;
    const patchNode = (node: any) => {
      if (node.nodeType === 3) {
        if (node.nodeValue === undefined) {
          Object.defineProperty(node, 'nodeValue', {
            get() { return this.rawText; },
            configurable: true
          });
        }
      } else if (node.nodeType === 1) {
        if (node.textContent === undefined) {
          Object.defineProperty(node, 'textContent', {
            get() { return this.text; },
            configurable: true
          });
        }
      }
      if (node.childNodes) {
        for (const child of node.childNodes) {
          patchNode(child);
        }
      }
    };
    patchNode(root);
    return root;
  }
}

function getVerNum(vId: string): number | null {
  const m = /^v?(\d+)$/.exec(vId);
  return m ? parseInt(m[1]!, 10) : null;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

function wrapElementInIns(el: any) {
  const leafItems = el.querySelectorAll('p, h1, h2, h3, h4, h5, h6, td, th, li');
  if (leafItems.length > 0) {
    for (const item of leafItems) {
      wrapElementInIns(item);
    }
  } else {
    const text = el.text || '';
    el.innerHTML = `<ins>${escapeHTML(text)}</ins>`;
  }
}

function wrapElementInDel(el: any) {
  const leafItems = el.querySelectorAll('p, h1, h2, h3, h4, h5, h6, td, th, li');
  if (leafItems.length > 0) {
    for (const item of leafItems) {
      wrapElementInDel(item);
    }
  } else {
    const text = el.text || '';
    el.innerHTML = `<del>${escapeHTML(text)}</del>`;
  }
}

function diffTextNodes(oldEl: any, newEl: any) {
  const oldText = oldEl.text || '';
  const newText = newEl.text || '';

  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(oldText, newText);
  dmp.diff_cleanupSemantic(diffs);

  let html = '';
  for (const [op, text] of diffs) {
    const escaped = escapeHTML(text);
    if (op === 0) {
      html += escaped;
    } else if (op === 1) {
      html += `<ins>${escaped}</ins>`;
    } else if (op === -1) {
      html += `<del>${escaped}</del>`;
    }
  }
  newEl.innerHTML = html;
}

function diffBlock(oldEl: any, newEl: any) {
  const tag = newEl.tagName?.toLowerCase();
  if (tag === 'table') {
    const oldRows = oldEl.querySelectorAll('tr');
    const newRows = newEl.querySelectorAll('tr');
    const minRows = Math.min(oldRows.length, newRows.length);
    for (let r = 0; r < minRows; r++) {
      const oldCells = oldRows[r].querySelectorAll('td, th');
      const newCells = newRows[r].querySelectorAll('td, th');
      const minCells = Math.min(oldCells.length, newCells.length);
      for (let c = 0; c < minCells; c++) {
        diffTextNodes(oldCells[c], newCells[c]);
      }
      for (let c = minCells; c < newCells.length; c++) {
        wrapElementInIns(newCells[c]);
      }
      for (let c = minCells; c < oldCells.length; c++) {
        const delCell = parse(oldCells[c].toString());
        wrapElementInDel(delCell);
        newRows[r].appendChild(delCell);
      }
    }
    for (let r = minRows; r < newRows.length; r++) {
      wrapElementInIns(newRows[r]);
    }
    for (let r = minRows; r < oldRows.length; r++) {
      const delRow = parse(oldRows[r].toString());
      wrapElementInDel(delRow);
      newEl.appendChild(delRow);
    }
  } else if (tag === 'ul' || tag === 'ol') {
    const oldItems = oldEl.querySelectorAll('li');
    const newItems = newEl.querySelectorAll('li');
    const minItems = Math.min(oldItems.length, newItems.length);
    for (let i = 0; i < minItems; i++) {
      diffTextNodes(oldItems[i], newItems[i]);
    }
    for (let i = minItems; i < newItems.length; i++) {
      wrapElementInIns(newItems[i]);
    }
    for (let i = minItems; i < oldItems.length; i++) {
      const delItem = parse(oldItems[i].toString());
      wrapElementInDel(delItem);
      newEl.appendChild(delItem);
    }
  } else {
    diffTextNodes(oldEl, newEl);
  }
}

function diffNodes(oldEl: any, newEl: any) {
  const tag = newEl.tagName?.toLowerCase();
  if (tag === 'table' || tag === 'ul' || tag === 'ol') {
    diffBlock(oldEl, newEl);
  } else {
    const hasElementChildren = newEl.childNodes.some((n: any) => n.nodeType === 1);
    if (hasElementChildren) {
      diffContainer(oldEl, newEl);
    } else {
      diffTextNodes(oldEl, newEl);
    }
  }
}

function diffContainer(oldEl: any, newEl: any) {
  const oldChildren = oldEl.childNodes.filter((n: any) => n.nodeType === 1);
  const newChildren = newEl.childNodes.filter((n: any) => n.nodeType === 1);

  const finalChildren: any[] = [];
  const matchedOld = new Set<any>();
  const oldIdMap = new Map<string, any>();
  for (const child of oldChildren) {
    const id = child.getAttribute('id');
    if (id) oldIdMap.set(id, child);
  }

  const newToOld = new Map<any, any>();
  const unmatchedOldNoId = oldChildren.filter((c: any) => !c.getAttribute('id'));

  for (const newChild of newChildren) {
    const id = newChild.getAttribute('id');
    let matched: any = null;
    if (id) {
      matched = oldIdMap.get(id);
    } else {
      const tag = newChild.tagName?.toLowerCase();
      const idx = unmatchedOldNoId.findIndex((c: any) => c.tagName?.toLowerCase() === tag);
      if (idx !== -1) {
        matched = unmatchedOldNoId[idx];
        unmatchedOldNoId.splice(idx, 1);
      }
    }
    if (matched) {
      newToOld.set(newChild, matched);
      matchedOld.add(matched);
    }
  }

  const insertedOld = new Set<any>();
  for (const newChild of newChildren) {
    const oldChild = newToOld.get(newChild);
    if (oldChild) {
      const oldIdx = oldChildren.indexOf(oldChild);
      for (let i = 0; i < oldIdx; i++) {
        const prevOld = oldChildren[i];
        if (!matchedOld.has(prevOld) && !insertedOld.has(prevOld)) {
          const delEl = parse(prevOld.toString());
          wrapElementInDel(delEl);
          finalChildren.push(delEl);
          insertedOld.add(prevOld);
        }
      }
      diffNodes(oldChild, newChild);
      finalChildren.push(newChild);
      insertedOld.add(oldChild);
    } else {
      wrapElementInIns(newChild);
      finalChildren.push(newChild);
    }
  }

  for (const oldChild of oldChildren) {
    if (!matchedOld.has(oldChild) && !insertedOld.has(oldChild)) {
      const delEl = parse(oldChild.toString());
      wrapElementInDel(delEl);
      finalChildren.push(delEl);
      insertedOld.add(oldChild);
    }
  }

  if (newEl.tagName) {
    newEl.innerHTML = '';
    for (const child of finalChildren) {
      newEl.appendChild(child);
    }
  } else {
    newEl.childNodes = [];
    for (const child of finalChildren) {
      newEl.appendChild(child);
    }
  }
}

export class CollabDoc {
  private _currentState: DocState = 'Draft';
  private _versions: DocVersion[] = [];
  private _lockedSectionIds: Set<string> = new Set<string>();
  private _sequence: number = 1;

  private _comments: DocComment[] = [];
  private _replies: DocReply[] = [];
  private _notifications: DocNotification[] = [];

  constructor(initialHtml: string) {
    const initialVersion: DocVersion = {
      versionNumber: 1,
      html: initialHtml,
      status: 'Draft',
      timestamp: new Date(),
    };
    this._versions.push(initialVersion);
  }

  get currentState(): DocState {
    return this._currentState;
  }

  get versions(): readonly DocVersion[] {
    return this._versions;
  }

  get lockedSectionIds(): Set<string> {
    return this._lockedSectionIds;
  }

  get sequence(): number {
    return this._sequence;
  }

  get comments(): readonly DocComment[] {
    return this._comments;
  }

  get replies(): readonly DocReply[] {
    return this._replies;
  }

  get notifications(): readonly DocNotification[] {
    return this._notifications;
  }

  getCurrentVersion(): DocVersion {
    if (this._versions.length === 0) {
      throw new Error("No versions available");
    }
    return this._versions[this._versions.length - 1]!;
  }

  getCurrentHtml(): string {
    return this.getCurrentVersion().html;
  }

  lockSection(id: string): void {
    this._lockedSectionIds.add(id);
  }

  unlockSection(id: string): void {
    this._lockedSectionIds.delete(id);
  }

  updateHtml(newHtml: string, expectedSequence?: number): void {
    if (expectedSequence !== undefined && expectedSequence !== this._sequence) {
      throw new Error("Conflict error: Stale version edit.");
    }

    if (this._currentState === 'Live') {
      throw new Error("Immutability Enforcement: Cannot directly edit a Live document.");
    }

    const currentVersion = this.getCurrentVersion();
    if (currentVersion.status === 'Live') {
      throw new Error("Immutability Enforcement: Current version is Live and immutable.");
    }

    const oldHtml = currentVersion.html;
    currentVersion.html = newHtml;
    currentVersion.timestamp = new Date();
    this._sequence += 1;

    // Check for deleted sections and archive associated comments/replies/notifications
    this._archiveCommentsForDeletedSections(oldHtml, newHtml);
  }

  promoteToLive(): void {
    if (this._currentState === 'Live') {
      throw new Error("Document is already Live.");
    }
    const currentVersion = this.getCurrentVersion();
    currentVersion.status = 'Live';
    this._currentState = 'Live';
  }

  createNewVersionDraft(): void {
    if (this._currentState === 'Draft') {
      throw new Error("Cannot create a new draft while already in Draft state.");
    }

    const lastLiveHtml = this.getCurrentHtml();
    const newVersionNumber = this._versions.length + 1;
    const newVersion: DocVersion = {
      versionNumber: newVersionNumber,
      html: lastLiveHtml,
      status: 'Draft',
      timestamp: new Date(),
    };
    this._versions.push(newVersion);
    this._currentState = 'Draft';
  }

  restoreVersion(versionNumber: number): void {
    const targetVersion = this._versions.find(v => v.versionNumber === versionNumber);
    if (!targetVersion) {
      throw new Error(`Version ${versionNumber} not found.`);
    }

    const newVersionNumber = this._versions.length + 1;
    const restoredHtml = targetVersion.html;

    const newVersion: DocVersion = {
      versionNumber: newVersionNumber,
      html: restoredHtml,
      status: 'Draft',
      timestamp: new Date(),
    };

    const oldHtml = this.getCurrentHtml();
    this._versions.push(newVersion);
    this._currentState = 'Draft';
    this._sequence += 1;

    // Archive / restore internal comments based on restored section IDs
    const restoredIds = this._extractElementIds(restoredHtml);
    for (const c of this._comments) {
      if (restoredIds.has(c.sectionId)) {
        c.isArchived = false;
      } else {
        c.isArchived = true;
      }
    }

    // Clone and re-anchor rich comments from comments.ts
    const allComments = getComments();
    const newCommentsToPush: Comment[] = [];
    const root = getDomRoot(restoredHtml);

    const candidateComments = allComments.filter(c => {
      const ver = getVerNum(c.versionId);
      return ver !== null && ver >= versionNumber;
    });

    for (const c of candidateComments) {
      const res = locate(root, c);
      const newCommentId = 'c' + Math.abs(hashString(JSON.stringify(c.target) + Date.now() + Math.random())).toString(36);

      const clonedComment: Comment = {
        ...c,
        id: newCommentId,
        versionId: 'v' + newVersionNumber,
        anchorStatus: res.status,
        posStart: res.status !== 'orphaned' ? res.start : undefined,
        posEnd: res.status !== 'orphaned' ? res.end : undefined,
        lastKnownContext: res.newText || res.newSnippet || c.lastKnownContext,
        replies: c.replies.map(r => ({ ...r })),
        history: [
          ...c.history,
          { event: `cloned from version ${c.versionId} during rollback`, who: 'System', when: Date.now() }
        ]
      };

      newCommentsToPush.push(clonedComment);
    }

    if (newCommentsToPush.length > 0) {
      setComments([...allComments, ...newCommentsToPush]);
    }
  }

  getDiffHtml(vOldNum: number, vNewNum: number): string {
    const oldVer = this._versions.find(v => v.versionNumber === vOldNum);
    const newVer = this._versions.find(v => v.versionNumber === vNewNum);
    if (!oldVer || !newVer) {
      throw new Error(`Version ${vOldNum} or ${vNewNum} not found.`);
    }

    const oldRoot = parse(oldVer.html);
    const newRoot = parse(newVer.html);

    diffContainer(oldRoot, newRoot);

    return newRoot.toString();
  }

  discardDraft(): void {
    if (this._currentState === 'Live') {
      throw new Error("No Draft version exists to discard.");
    }

    if (this._versions.length <= 1) {
      throw new Error("Cannot discard the initial draft (no previous Live version).");
    }

    // Pop the current draft version
    this._versions.pop();

    const prevVersion = this.getCurrentVersion();
    this._currentState = prevVersion.status;
  }

  regenerate(newHtmlProducedByLlm: string, expectedSequence?: number): void {
    if (expectedSequence !== undefined && expectedSequence !== this._sequence) {
      throw new Error("Conflict error: Stale version edit.");
    }

    if (this._currentState === 'Live') {
      throw new Error("Cannot regenerate a Live document.");
    }

    const oldHtml = this.getCurrentHtml();
    const splicedHtml = splicePreservedSections(oldHtml, newHtmlProducedByLlm, this._lockedSectionIds);
    this.updateHtml(splicedHtml);
  }

  // Comment management methods
  addComment(id: string, sectionId: string, content: string): void {
    this._comments.push({ id, sectionId, content, isArchived: false });
  }

  addReply(id: string, commentId: string, content: string): void {
    this._replies.push({ id, commentId, content, isArchived: false });
  }

  addNotification(id: string, userId: string, message: string, commentId?: string, replyId?: string): void {
    this._notifications.push({ id, userId, message, isRead: false, isArchived: false, commentId, replyId });
  }

  archiveComment(commentId: string): void {
    const comment = this._comments.find(c => c.id === commentId);
    if (!comment) return;

    comment.isArchived = true;

    // Cascade to replies
    const affectedReplyIds = new Set<string>();
    for (const r of this._replies) {
      if (r.commentId === commentId) {
        r.isArchived = true;
        affectedReplyIds.add(r.id);
      }
    }

    // Cascade to notifications
    for (const n of this._notifications) {
      if (n.commentId === commentId || (n.replyId && affectedReplyIds.has(n.replyId))) {
        n.isArchived = true;
      }
    }
  }

  archiveReply(replyId: string): void {
    const reply = this._replies.find(r => r.id === replyId);
    if (!reply) return;

    reply.isArchived = true;

    // Cascade to notifications
    for (const n of this._notifications) {
      if (n.replyId === replyId) {
        n.isArchived = true;
      }
    }
  }

  archiveNotification(notificationId: string): void {
    const notification = this._notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.isArchived = true;
    }
  }

  private _extractElementIds(html: string): Set<string> {
    const root = parse(html, { comment: true });
    const ids = new Set<string>();
    const elements = root.querySelectorAll('[id]');
    for (const el of elements) {
      const id = el.getAttribute('id');
      if (id) {
        ids.add(id);
      }
    }
    return ids;
  }

  private _archiveCommentsForDeletedSections(oldHtml: string, newHtml: string): void {
    const oldIds = this._extractElementIds(oldHtml);
    const newIds = this._extractElementIds(newHtml);
    for (const id of oldIds) {
      if (!newIds.has(id)) {
        for (const c of this._comments) {
          if (c.sectionId === id && !c.isArchived) {
            this.archiveComment(c.id);
          }
        }
      }
    }
  }
}
