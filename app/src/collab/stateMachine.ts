import { parse } from 'node-html-parser';

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
