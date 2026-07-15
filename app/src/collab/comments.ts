import { diff_match_patch } from 'diff-match-patch';
import type { SemanticNodeId, SemanticNodeKind, SemanticArtifact, SemanticNode } from '../semantic/types.js';

export interface TextTarget {
  type: 'text';
  quote: string;
  prefix: string;
  suffix: string;
}

export interface ElementTarget {
  type: 'element';
  id: string;
  path: string;
  hash: number;
  tag: string;
  snippet: string;
}

/** Semantic anchor — primary anchor for comments made on the decision-room canvas.
 *  Keyed on the STABLE SemanticNodeId (app/src/semantic/types.ts). */
export interface SemanticCommentTarget {
  type: 'semantic';
  artifactId: string;            // === SemanticArtifact.id (identity guard; re-import = new doc)
  semanticNodeId: SemanticNodeId;
  visualBlockId?: string;        // the VisualBlock the comment was made from, if any
  /** Creation-time SNAPSHOT for rail grouping/display without a live artifact lookup.
   *  Not kept in sync; live kind/label are re-resolved from the artifact when present. */
  nodeKind?: SemanticNodeKind;
  nodeLabel?: string;
}

export type AnchorTarget = TextTarget | ElementTarget | SemanticCommentTarget;

export interface HistoryEvent {
  event: string;
  who: string;
  when: number;
}

export interface Reply {
  id: string;
  author: string;
  body: string;
  mentions: string[];
  ts: number;
}

export interface Resolution {
  resolvedBy: string;
  resolvedAt: number;
  changeLink?: {
    before: string;
    after: string;
  } | null;
  /** HTML version active at resolution — powers "Resolved with change in v3". */
  resolvedInVersion?: number;
  /** For semantic-target comments, the node the resolution pertains to (snapshot). */
  semanticNodeId?: SemanticNodeId;
}

export interface Comment {
  id: string;
  versionId: string;
  author: string;
  body: string;
  createdAt: number;
  feedbackType: 'approve' | 'flag' | 'needs' | 'question' | null;
  lifecycle: 'open' | 'resolved';
  anchorStatus: 'anchored' | 'stale' | 'orphaned';
  target: AnchorTarget;
  posStart?: number;
  posEnd?: number;
  lastKnownContext: string;
  resolution: Resolution | null;
  replies: Reply[];
  mentions: string[];
  history: HistoryEvent[];
}

export interface NotificationRecord {
  id: string;
  to: string;
  by: string;
  commentId: string;
  replyId: string | null;
  snippet: string;
  ts: number;
  read: boolean;
}

export type Verdict = 'approve' | 'changes' | 'block' | null;

export interface AnchorResult {
  status: 'anchored' | 'stale' | 'orphaned';
  el?: any;
  newSnippet?: string;
  start?: number;
  end?: number;
  newText?: string;
  fuzzy?: number;
}

const MEMBERS = [
  { id: 'nirat', name: 'Nirat' },
  { id: 'alex', name: 'Alex' },
  { id: 'priya', name: 'Priya' },
  { id: 'sam', name: 'Sam' }
];

let commentsList: Comment[] = [];
let notificationsList: NotificationRecord[] = [];
let currentUserVal: string = 'Alex';
let verdictsList: Record<string, Verdict> = {};

export function getComments(): Comment[] {
  return commentsList;
}

export function setComments(comments: Comment[]): void {
  commentsList = comments;
}

export function getNotifications(): NotificationRecord[] {
  return notificationsList;
}

export function setNotifications(notifications: NotificationRecord[]): void {
  notificationsList = notifications;
}

export function getCurrentUser(): string {
  return currentUserVal;
}

export function setCurrentUser(user: string): void {
  currentUserVal = user;
}

export function getVerdicts(): Record<string, Verdict> {
  return verdictsList;
}

export function setVerdicts(v: Record<string, Verdict>): void {
  verdictsList = v;
}

export function resetState(): void {
  commentsList = [];
  notificationsList = [];
  currentUserVal = 'Alex';
  verdictsList = {};
}

// Recursive traversal for finding text nodes
function textNodes(root: any): any[] {
  const nodes: any[] = [];
  const traverse = (node: any) => {
    if (node.nodeType === 3 /* Node.TEXT_NODE */) {
      nodes.push(node);
    } else if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) {
        traverse(node.childNodes[i]);
      }
    }
  };
  traverse(root);
  return nodes;
}

export function cleanText(s: string): string {
  return (s || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
}

export function cleanContext(s: string): string {
  return (s || '').replace(/\u200b/g, '').replace(/\s+/g, ' ');
}

export function getCleanedTextAndMap(raw: string): { cleaned: string; map: number[] } {
  let cleaned = '';
  const map: number[] = [];
  let inWhitespace = false;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!;
    if (char === '\u200b') {
      continue;
    }
    if (/\s/.test(char)) {
      if (!inWhitespace) {
        cleaned += ' ';
        map.push(i);
        inWhitespace = true;
      }
    } else {
      cleaned += char;
      map.push(i);
      inWhitespace = false;
    }
  }
  return { cleaned, map };
}

export function elHash(el: any): number {
  const s = cleanText(el.textContent ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

export function elPath(el: any, root: any): string {
  const seg: string[] = [];
  let current = el;
  while (current && current !== root && current.parentNode) {
    const tag = current.tagName.toLowerCase();
    let index = 1;
    let sib = current;
    while ((sib = sib.previousElementSibling)) {
      if (sib.tagName.toLowerCase() === tag) {
        index++;
      }
    }
    seg.unshift(`${tag}:nth-of-type(${index})`);
    current = current.parentNode;
  }
  return seg.join('>');
}

export function byPath(root: any, path: string): any | null {
  if (!path) return null;
  let el = root;
  for (const seg of path.split('>')) {
    const match = /^(\w+):nth-of-type\((\d+)\)$/.exec(seg);
    if (!match) return null;
    const tag = match[1]!;
    const n = parseInt(match[2]!, 10);
    let count = 0;
    let found = null;
    for (let i = 0; i < el.children.length; i++) {
      const ch = el.children[i];
      if (ch.tagName.toLowerCase() === tag) {
        count++;
        if (count === n) {
          found = ch;
          break;
        }
      }
    }
    if (!found) return null;
    el = found;
  }
  return el === root ? null : el;
}

export function snippetOf(el: any): string {
  return cleanText(el.textContent ?? "").slice(0, 60);
}

export function makeElTarget(el: any, root: any): ElementTarget {
  return {
    type: 'element',
    id: el.id || '',
    path: elPath(el, root),
    hash: elHash(el),
    tag: el.tagName.toLowerCase(),
    snippet: snippetOf(el)
  };
}

export function rangeFromOffsets(root: any, start: number, end: number): Range | null {
  if (typeof document === 'undefined') return null;
  const nodes = textNodes(root);
  let totalLen = 0;
  let range = document.createRange();
  let startSet = false;

  for (const t of nodes) {
    const len = (t.nodeValue || '').length;
    if (!startSet && start <= totalLen + len) {
      range.setStart(t, start - totalLen);
      startSet = true;
    }
    if (startSet && end <= totalLen + len) {
      range.setEnd(t, end - totalLen);
      return range;
    }
    totalLen += len;
  }
  return null;
}

function matchMainSafe(dmp: any, text: string, pattern: string, expectedLoc: number): number {
  if (pattern.length <= 32) {
    try {
      return dmp.match_main(text, pattern, expectedLoc);
    } catch {
      return -1;
    }
  }

  const chunkSize = 32;
  const candidates: { startIdx: number; score: number }[] = [];

  const chunkOffsets = [
    0,
    Math.floor((pattern.length - chunkSize) / 2),
    pattern.length - chunkSize
  ].filter((offset, index, self) => self.indexOf(offset) === index);

  for (const offset of chunkOffsets) {
    const chunk = pattern.slice(offset, offset + chunkSize);
    try {
      const adjustedLoc = Math.max(0, expectedLoc + offset);
      const chunkMatchIdx = dmp.match_main(text, chunk, adjustedLoc);

      if (chunkMatchIdx !== -1) {
        const candidateStartIdx = chunkMatchIdx - offset;
        if (candidateStartIdx >= 0 && candidateStartIdx + pattern.length <= text.length + 50) {
          if (!candidates.some(c => c.startIdx === candidateStartIdx)) {
            const actualLen = Math.min(pattern.length + 20, text.length - candidateStartIdx);
            const substring = text.slice(candidateStartIdx, candidateStartIdx + actualLen);
            const diffs = dmp.diff_main(pattern, substring);
            const distance = dmp.diff_levenshtein(diffs);
            const maxLen = Math.max(pattern.length, substring.length);
            const score = maxLen > 0 ? 1 - distance / maxLen : 0;

            candidates.push({ startIdx: candidateStartIdx, score });
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  if (candidates.length === 0) {
    return -1;
  }

  candidates.sort((a, b) => b.score - a.score);

  const bestCandidate = candidates[0]!;
  if (bestCandidate.score >= 0.4) {
    return bestCandidate.startIdx;
  }

  return -1;
}

/** Resolve a semantic anchor against the live artifact. The semantic counterpart of locate(). */
export function resolveSemanticTarget(
  artifact: Pick<SemanticArtifact, 'id' | 'nodes'>,
  target: SemanticCommentTarget
): { status: 'anchored' | 'orphaned'; node?: SemanticNode } {
  if (target.artifactId !== artifact.id) return { status: 'orphaned' };
  const node = artifact.nodes.find((n) => n.id === target.semanticNodeId);
  return node ? { status: 'anchored', node } : { status: 'orphaned' };
}

export function locate(root: any, c: Comment): AnchorResult {
  // Semantic targets do not resolve against the HTML DOM — they are anchored via
  // resolveSemanticTarget(artifact, target). On the HTML surface they have no placement.
  if (c.target.type === 'semantic') return { status: 'orphaned' };

  const t = c.target;

  if (t.type === 'element') {
    let e = null;
    if (t.id) {
      const escapedId = typeof window !== 'undefined' && window.CSS && window.CSS.escape
        ? window.CSS.escape(t.id)
        : t.id;
      try {
        e = root.querySelector(`#${escapedId}`);
      } catch {
        e = root.querySelector(`[id="${t.id}"]`);
      }
    }
    if (!e) {
      e = byPath(root, t.path);
    }
    if (!e && t.hash != null) {
      const all = root.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        if (elHash(all[i]) === t.hash) {
          e = all[i];
          break;
        }
      }
    }
    if (!e) {
      return { status: 'orphaned' };
    }
    return {
      status: elHash(e) === t.hash ? 'anchored' : 'stale',
      el: e,
      newSnippet: snippetOf(e)
    };
  }

  const nodes = textNodes(root);
  const rawFullText = nodes.map(n => n.nodeValue || '').join('');
  const { cleaned: cleanFullText, map: cleanToRawMap } = getCleanedTextAndMap(rawFullText);

  const q = cleanContext(t.quote);
  const pre = cleanContext(t.prefix);
  const suf = cleanContext(t.suffix);

  if (!q) {
    return { status: 'orphaned' };
  }

  // Find all exact occurrences of q in cleanFullText
  const hits: number[] = [];
  let i = cleanFullText.indexOf(q);
  while (i !== -1) {
    hits.push(i);
    i = cleanFullText.indexOf(q, i + 1);
  }

  // If exactly one match is found
  if (hits.length === 1) {
    const cleanStart = hits[0]!;
    const cleanEnd = cleanStart + q.length;
    const start = cleanToRawMap[cleanStart]!;
    const end = cleanToRawMap[cleanEnd - 1]! + 1;
    return { status: 'anchored', start, end };
  }

  // If multiple matches are found, use prefix and suffix context for disambiguation
  if (hits.length > 1) {
    let best = hits[0]!;
    let bestScore = -1;
    for (const h of hits) {
      const p = cleanFullText.slice(Math.max(0, h - pre.length), h);
      const s = cleanFullText.slice(h + q.length, h + q.length + suf.length);
      const score = (p.endsWith(pre) ? pre.length : 0) + (s.startsWith(suf) ? suf.length : 0);
      if (score > bestScore) {
        bestScore = score;
        best = h;
      }
    }
    const cleanStart = best;
    const cleanEnd = cleanStart + q.length;
    const start = cleanToRawMap[cleanStart]!;
    const end = cleanToRawMap[cleanEnd - 1]! + 1;
    return { status: 'anchored', start, end };
  }

  // If no exact match is found, check if pre + suf can bracket a modified quote (context-bracket)
  const STALE_WINDOW = 400;
  if (pre && suf) {
    const pi = cleanFullText.indexOf(pre);
    if (pi !== -1) {
      const ap = pi + pre.length;
      const si = cleanFullText.indexOf(suf, ap);
      if (si !== -1 && si - ap <= STALE_WINDOW) {
        const cleanStart = ap;
        const cleanEnd = si;
        const start = cleanToRawMap[cleanStart]!;
        const end = cleanToRawMap[cleanEnd - 1]! + 1;
        return {
          status: 'stale',
          start,
          end,
          newText: rawFullText.slice(start, end)
        };
      }
    }
  }

  // Last resort: fuzzy match using diff-match-patch
  const cleanPre = pre;
  const hintIdx = (cleanPre && cleanFullText.includes(cleanPre))
    ? cleanFullText.indexOf(cleanPre) + cleanPre.length
    : (c.posStart !== undefined ? c.posStart : 0);

  const dmp = new diff_match_patch();
  dmp.Match_Threshold = 0.5;

  const cleanHintIdx = cleanToRawMap.indexOf(hintIdx);
  const targetCleanHintIdx = cleanHintIdx !== -1 ? cleanHintIdx : hintIdx;

  const idx = matchMainSafe(dmp, cleanFullText, q, targetCleanHintIdx);
  if (idx !== -1) {
    const matchedSubClean = cleanFullText.slice(idx, idx + q.length);
    const diffs = dmp.diff_main(q, matchedSubClean);
    const distance = dmp.diff_levenshtein(diffs);
    const maxLen = Math.max(q.length, matchedSubClean.length);
    const score = maxLen > 0 ? 1 - distance / maxLen : 1;

    const FUZZY_THRESHOLD = 0.6;
    if (score >= FUZZY_THRESHOLD) {
      const cleanStart = idx;
      const cleanEnd = idx + q.length;
      const start = cleanToRawMap[cleanStart]!;
      const end = cleanToRawMap[cleanEnd - 1]! + 1;
      return {
        status: 'stale',
        start,
        end,
        newText: rawFullText.slice(start, end),
        fuzzy: parseFloat(score.toFixed(2))
      };
    }
  }

  return { status: 'orphaned' };
}

export function escapeHTML(str: string): string {
  return str.replace(/[&<>"]/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m] || m));
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

export function parseMentions(text: string): string[] {
  const out = new Set<string>();
  const re = /@(\w+)/g;
  let m;
  while ((m = re.exec(text || ''))) {
    const tok = m[1]!.toLowerCase();
    const mem = MEMBERS.find(x => x.id === tok || x.name.toLowerCase() === tok);
    if (mem) {
      out.add(mem.id);
    }
  }
  return [...out];
}

export function recordNotification(
  mentions: string[],
  by: string,
  commentId: string,
  replyId: string | null,
  snippet: string
): void {
  const byLower = by.toLowerCase();
  const currentUserMember = MEMBERS.find(m => m.name.toLowerCase() === byLower || m.id === byLower);
  const currentUserId = currentUserMember ? currentUserMember.id : byLower;

  for (const to of mentions) {
    if (to === currentUserId) {
      continue;
    }

    const id = 'n' + Math.abs(hashString(to + by + snippet + Date.now() + Math.random())).toString(36);
    notificationsList.push({
      id,
      to,
      by,
      commentId,
      replyId,
      snippet: snippet.slice(0, 60),
      ts: Date.now(),
      read: false
    });
  }
}

export function addComment(
  target: AnchorTarget,
  body: string,
  feedbackType: Comment['feedbackType'] = null,
  versionId: string = 'v1',
  posStart?: number,
  posEnd?: number
): Comment {
  const author = currentUserVal;
  const cleanedBody = escapeHTML(body);
  const mentions = parseMentions(cleanedBody);
  const comment: Comment = {
    id: 'c' + Math.abs(hashString(JSON.stringify(target) + Date.now() + Math.random())).toString(36),
    versionId,
    author,
    createdAt: Date.now(),
    body: cleanedBody,
    feedbackType,
    lifecycle: 'open',
    anchorStatus: 'anchored',
    target,
    lastKnownContext:
      target.type === 'element' ? target.snippet
      : target.type === 'semantic' ? (target.nodeLabel ?? target.semanticNodeId)
      : target.quote,
    resolution: null,
    replies: [],
    mentions,
    history: [{ event: 'created', who: author, when: Date.now() }]
  };

  if (target.type === 'text') {
    comment.posStart = posStart !== undefined ? posStart : 0;
    comment.posEnd = posEnd !== undefined ? posEnd : target.quote.length;
  }

  commentsList.push(comment);
  recordNotification(mentions, author, comment.id, null, cleanedBody);
  return comment;
}

export function addReply(commentId: string, body: string): Reply {
  const c = commentsList.find(x => x.id === commentId);
  if (!c) {
    throw new Error(`Comment not found: ${commentId}`);
  }
  const author = currentUserVal;
  const cleanedBody = escapeHTML(body);
  const mentions = parseMentions(cleanedBody);
  const reply: Reply = {
    id: 'r' + Math.abs(hashString(cleanedBody + Date.now() + Math.random())).toString(36),
    author,
    body: cleanedBody,
    mentions,
    ts: Date.now()
  };

  c.replies.push(reply);
  c.history.push({ event: 'reply added', who: author, when: Date.now() });

  recordNotification(mentions, author, commentId, reply.id, cleanedBody);
  return reply;
}

export function resolveComment(
  commentId: string,
  changeLink?: { before: string; after: string } | null,
  versionNumber?: number
): Comment {
  const c = commentsList.find(x => x.id === commentId);
  if (!c) {
    throw new Error(`Comment not found: ${commentId}`);
  }
  const author = currentUserVal;
  c.lifecycle = 'resolved';
  const resolution: Resolution = {
    resolvedBy: author,
    resolvedAt: Date.now(),
    changeLink: changeLink || null
  };
  if (versionNumber !== undefined) {
    resolution.resolvedInVersion = versionNumber;
  }
  if (c.target.type === 'semantic') {
    resolution.semanticNodeId = c.target.semanticNodeId;
  }
  c.resolution = resolution;

  const versionSuffix = versionNumber !== undefined ? ` in v${versionNumber}` : '';
  const eventName = changeLink
    ? `resolved (content edited)${versionSuffix}`
    : `resolved (no change)${versionSuffix}`;
  c.history.push({ event: eventName, who: author, when: Date.now() });
  return c;
}

export function reopenComment(commentId: string): Comment {
  const c = commentsList.find(x => x.id === commentId);
  if (!c) {
    throw new Error(`Comment not found: ${commentId}`);
  }
  const author = currentUserVal;
  c.lifecycle = 'open';
  c.resolution = null;
  c.history.push({ event: 'reopened', who: author, when: Date.now() });
  return c;
}

export function deleteComment(commentId: string): void {
  commentsList = commentsList.filter(c => c.id !== commentId);
  notificationsList = notificationsList.filter(n => n.commentId !== commentId);
}

export function setVerdict(user: string, verdict: Verdict): void {
  verdictsList[user] = verdict;
}

export function handleAutocompleteSelect(textarea: any, memberName: string): void {
  const pos = textarea.selectionStart;
  const val = textarea.value;
  const before = val.slice(0, pos).replace(/@(\w*)$/, '@' + memberName + ' ');
  textarea.value = before + val.slice(pos);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = before.length;
}
