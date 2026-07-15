# Viscollab Rebuild — Architecture Brief (Phase 7: Semantic Comments & Review Rail)

Date: **2026-07-14**. Status: **BINDING for Phase 7**. Subordinate to `docs/rebuild-architecture.md`
— its §0 ground rules (two packages / one direction, the `cd app && npm run build` rule, hand-rolled
validation / no zod, the testing model, light/executive styling, "legacy stays") **remain in force**
here and are not restated. Where this doc is silent, the main brief governs. Where the plan
(`docs/visual-decision-room-plan.md` Phase 7 + COLLAB-001..004) is ambiguous, the decision here wins
and is marked **ARCH DECISION**.

Read order for a builder: this file → the plan's Phase 7 section → the files in §11's module map.

Implements plan Phase 7 requirements 1–8 and task queue `COLLAB-001..004`. Resolves the hard
prerequisite **BACK-008** (§6). For awareness: BACK-013..017 are not in scope (BACK-016's dark rail
is, incidentally, retired for decision rooms by this phase — see §4).

---

## 0. Scope in one paragraph

Comments today anchor to the HTML DOM only (`TextTarget` / `ElementTarget`, resolved by `locate()`).
Phase 7 adds a **third anchor type keyed on the stable `SemanticNodeId`** so a reviewer can comment on
"Risk R2" or "Option B" directly on the decision-room canvas, redesigns the right rail into a **light,
grouped, filterable** review surface (decision-room-only), and wires **hover/click linking + per-node
comment-count badges** between comment cards and visual nodes. All pure, deterministic logic lands in
`app/src/collab/` (so the app vitest suite tests it offline, per main-brief C4); the web layer is
presentational wiring. No LLM, no persistence migration, no new API shape.

---

## 1. Current-state facts this brief contracts against (verified in code)

- **`app/src/collab/comments.ts`** — `AnchorTarget = TextTarget | ElementTarget`, discriminated by
  `type`. `Comment` carries top-level `versionId: string` (set to `v${activeVersionNum}` — the **HTML**
  version), `lifecycle`, `anchorStatus`, `resolution`, `history[]`. `locate(root, c)` switches on
  `t.type === 'element'` and otherwise treats the target as text; it operates on the HTML DOM.
  `resolveComment(id, changeLink?)` pushes a `resolved (...)` history event. The file's only runtime
  dep is `diff-match-patch`; adding **type-only** imports from `../semantic/types.js` is one-directional
  (semantic never imports collab) — no cycle.
- **The semantic artifact is UNVERSIONED** — one `SemanticArtifact` per document, stored in the
  document's `collab_state` blob (`semanticArtifact` / `visualPlan` keys). HTML versions are separate
  (`documentVersions` / `activeVersionNum`). Re-import = a **new document** (new blob), so a comment
  never outlives the artifact it was made against within one doc. Phase 9 owns real persistence; do NOT
  invent artifact versioning.
- **`web/.../DecisionRoomApp.tsx`** owns all comment state/handlers (`comments`, `selectedCommentId`,
  `selectedRange`, `commentTargetSection`, `handleAddComment/Reply/ResolveComment/SelectComment`,
  `syncState`, the 3s poll) and composes `TopDecisionBar` + `VisualTabs` + `ReviewRail` inside
  `DecisionRoomLayout`. Router picks by data: `semanticArtifact` present → `VisualTabs`; absent → legacy
  `DocumentSurface`. The 3s poll uses a snapshot ref and pauses while the composer/sandbox is open
  (the render-storm fix — do not regress it, see §6).
- **`ReviewRail.tsx` is a 4-line pass-through** to the legacy dark `CommentSidebar` (bg-slate-900,
  indigo, backdrop-blur). Phase 6 left it as-is on purpose (BACK-016).
- **BACK-008 confirmed.** `data-visual-block-id` is emitted TWICE per block: on the
  `NodeViewWrapper` (`VisualBlockNodeView.tsx` line 243) **and** on every leaf component root
  (`DecisionBrief.tsx:59`, `TradeoffMatrix.tsx:42`, `RiskMap.tsx:42`, `MindMapView.tsx:73/81`,
  `ArgumentMapView.tsx:58/66`, `ActionChecklist.tsx:30`, `TimelineView.tsx:30`, `OpenQuestions.tsx:27`).
  `data-semantic-node-id` is emitted by leaves only (nodes) + `FlowCardNode` (`shared.tsx:163`). A
  `querySelectorAll('[data-visual-block-id="X"]')` therefore returns two nested elements today — must be
  one before hover-linking is built on it.

**Surprise / constraint worth flagging:** `handleResolveComment` in `DecisionRoomApp` is a hand-rolled
inline map that toggles lifecycle and builds `resolution` directly (it does NOT call the app's
`resolveComment`). So the "resolved in vN" change (§7) must be applied in **both** the app fn (for
tests/future callers) and this inline handler (the live path). They are kept behavior-parallel.

---

## 2. Data-model changes — `app/src/collab/comments.ts` (COLLAB-001)

Copy verbatim. Add at the top: `import type { SemanticNodeId, SemanticNodeKind, SemanticArtifact, SemanticNode } from '../semantic/types.js';`

```ts
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
```

**ARCH DECISION — no `versionId` on the target.** The plan sketches
`{ artifactId, versionId, semanticNodeId, visualBlockId? }`, but the artifact is unversioned today.
`artifactId` fully identifies the anchored artifact; the HTML version context already lives on
`Comment.versionId` (unchanged). Adding a target-level `versionId` would imply artifact versioning that
does not exist and that Phase 9 owns. Forward-compat is preserved: if artifact versioning ever lands,
it rides on `artifactId` or a field added then — not speculatively now.

**ARCH DECISION — `anchorStatus` for semantic targets is `anchored | orphaned` only.** A semantic
anchor is `anchored` iff its `semanticNodeId` exists in the current artifact; `orphaned` iff the node is
gone or `artifactId` mismatches (can only happen via re-import, which makes a new doc). `stale` is never
set for semantic targets in v1 (no partial-match concept). The field still allows `stale` for
forward-compat; the resolver just never produces it.

```ts
/** Resolve a semantic anchor against the live artifact. The semantic counterpart of locate(). */
export function resolveSemanticTarget(
  artifact: Pick<SemanticArtifact, 'id' | 'nodes'>,
  target: SemanticCommentTarget
): { status: 'anchored' | 'orphaned'; node?: SemanticNode } {
  if (target.artifactId !== artifact.id) return { status: 'orphaned' };
  const node = artifact.nodes.find((n) => n.id === target.semanticNodeId);
  return node ? { status: 'anchored', node } : { status: 'orphaned' };
}
```

**`locate()` guard (verbatim first statement of the function body):**

```ts
// Semantic targets do not resolve against the HTML DOM — they are anchored via
// resolveSemanticTarget(artifact, target). On the HTML surface they have no placement.
if (c.target.type === 'semantic') return { status: 'orphaned' };
```

This makes semantic comments simply not highlight on the legacy HTML surface (correct — they belong to
the canvas). DocumentSurface must NOT persist this ephemeral `orphaned` back onto `comment.anchorStatus`
(it already treats `locate()` output as ephemeral highlight data — verify in review).

**ORCHESTRATOR AMENDMENT (2026-07-14, review of this brief) — the AI-edit re-anchor loop persists
`locate()` output.** `DecisionRoomApp.handleCommitAiEdit` maps every open comment through
`locate(containerDiv, c)` and WRITES `locateResult.status` back onto `comment.anchorStatus` (plus
`lastKnownContext`) when committing an AI edit — so with the guard above, one committed AI edit would
permanently orphan every semantic comment. The web wave MUST change that loop: comments with
`target.type === 'semantic'` are **skipped entirely** (returned unchanged — an HTML edit cannot move a
semantic anchor; their status is owned by `resolveSemanticTarget`, evaluated live). Added to §11 web
step 6 and the §12 checklist.

**Extend `Resolution` (reuse the existing history[] pattern — no new tracking metadata):**

```ts
export interface Resolution {
  resolvedBy: string;
  resolvedAt: number;
  changeLink?: { before: string; after: string } | null;
  /** HTML version active at resolution — powers "Resolved with change in v3". */
  resolvedInVersion?: number;
  /** For semantic-target comments, the node the resolution pertains to (snapshot). */
  semanticNodeId?: SemanticNodeId;
}
```

**Extend `resolveComment`** with an optional trailing `versionNumber?: number`. When present, set
`resolution.resolvedInVersion` and include it in the history event text
(`resolved (content edited) in v3` / `resolved (no change) in v3`); when the target is semantic, set
`resolution.semanticNodeId = target.semanticNodeId`. Signature stays backward-compatible.

---

## 3. Anchor preference + fallback (COLLAB-002) — gesture → target type

**ARCH DECISION — the anchor type is decided by the gesture that opened the composer**, resolved in this
precedence inside `handleAddComment`: pending semantic anchor → text selection → whole-section.

| Gesture / origin | Target produced | Notes |
|---|---|---|
| Click a visual node on the canvas (Brief/Tradeoffs/Risks/Actions/Map) with no existing comments | `SemanticCommentTarget` | `semanticNodeId` from `[data-semantic-node-id]`; `visualBlockId` from the nearest `[data-visual-block-id]`; `nodeKind`/`nodeLabel` snapshotted from the artifact node. |
| Text selection on the **Source** tab / legacy `DocumentSurface` | `TextTarget` | Unchanged `locate()` machinery (exact→context→fuzzy→orphan). |
| Section hover-toolbar "comment" on the Source tab / legacy surface | `ElementTarget` | Unchanged. |
| Any gesture on a **legacy doc** (no `semanticArtifact`) | `TextTarget` / `ElementTarget` only | No semantic anchoring path exists without an artifact. |

Add a pure builder in **`app/src/collab/review.ts`** (new file) so the precedence is unit-testable
offline:

```ts
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
```

DecisionRoomApp gains one state — `pendingSemanticAnchor: CommentGesture['semantic'] | null` — set by the
canvas click handler (§6) and cleared on submit/cancel. `handleAddComment` calls `buildCommentTarget`
instead of its inline ternary. The composer shows the anchor context ("Commenting on: **Risk R2**")
when a semantic anchor is pending, in place of the highlighted-text preview.

---

## 4. Review rail redesign (COLLAB-003) — grouping

**ARCH DECISION — the redesigned rail is decision-room-only; the legacy `CommentSidebar` stays for
legacy docs.** Per the "legacy stays" ground rule: `DecisionRoomApp` renders the new `ReviewRail` when
`semanticArtifact` is present, and the existing dark `CommentSidebar` (untouched) when it is absent. This
retires the last dark chrome inside decision rooms (BACK-016) without touching the legacy path.

Groups, in fixed display order: **Blockers · Risks · Questions · Decisions · Actions · Resolved.**

```ts
export type ReviewGroup =
  | 'blockers' | 'risks' | 'questions' | 'decisions' | 'actions' | 'resolved';

export const REVIEW_GROUP_ORDER: ReviewGroup[] = [
  'blockers', 'risks', 'questions', 'decisions', 'actions', 'resolved',
];
export const REVIEW_GROUP_LABEL: Record<ReviewGroup, string> = {
  blockers: 'Blockers', risks: 'Risks', questions: 'Questions',
  decisions: 'Decisions', actions: 'Actions', resolved: 'Resolved',
};
```

**Grouping principle:** `Resolved` wins over everything (lifecycle). For open comments, `feedbackType
'flag'` is the one escalation override → `Blockers`; otherwise group by the **anchored node's kind**;
`feedbackType` is the fallback when the node kind is uninformative or there is no semantic target.

```ts
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
```

The web rail computes `kind` for each comment via a small helper (`resolveSemanticTarget(artifact,
target).node?.kind ?? target.nodeKind` for semantic targets; `undefined` otherwise) and buckets with
`groupOfComment`. Empty groups render nothing (no empty headers). Each group header shows a count
(`REVIEW_GROUP_LABEL[g] (n)`) — see §8.

`needs`-feedback mapping to `Questions` is deliberate: "Needs data" is an open evidentiary request, not a
hard blocker. Documented so it isn't "fixed" later by accident.

---

## 5. Filters (COLLAB-003) — `unresolved · mine · blockers · stale`

Client-side **view state only**; never persisted, never sent to the server (tenet #3 — no tracking).
Predicates are pure (`app/src/collab/review.ts`), so they are unit-tested:

```ts
export interface ReviewFilterCtx { currentUserName: string;
                                   groupOf: (c: Comment) => ReviewGroup; }
export const REVIEW_FILTER_PREDICATES = {
  unresolved: (c: Comment) => c.lifecycle === 'open',
  mine:       (c: Comment, ctx: ReviewFilterCtx) => c.author === ctx.currentUserName,
  blockers:   (c: Comment, ctx: ReviewFilterCtx) => ctx.groupOf(c) === 'blockers',
  stale:      (c: Comment) => c.anchorStatus === 'stale' || c.anchorStatus === 'orphaned',
} as const;
export type ReviewFilterKey = keyof typeof REVIEW_FILTER_PREDICATES;
```

**ARCH DECISION — filters are independent toggles combined with AND, applied BEFORE grouping.** A
comment shows iff it passes every active filter. (`unresolved` therefore empties the `Resolved` group —
correct.) `mine` = authored by the current user (unambiguous, non-surveillance); mention-based filtering
is a possible future add, out of scope now.

---

## 6. Hover linking + comment badges (COLLAB-004) + BACK-008

### 6.1 BACK-008 resolution — single owner: the leaf/surface

**ARCH DECISION — the visual leaf component (the block's rendered surface) owns `data-visual-block-id`;
remove it from the `NodeViewWrapper`.** The leaves already emit it (§1) AND are used standalone in the
`/preview/visual` route without any NodeView, so they are the durable owner. Exact changes:

- `web/src/components/tiptap/VisualBlockNodeView.tsx`: **delete `data-visual-block-id={blockId}` from
  the `NodeViewWrapper`** (line 243). Keep `data-block-kind` on the wrapper (debug only; not part of the
  anchoring contract). In `SourceExcerptBody` and the unknown-kind fallback card (which have no leaf
  component), **add `data-visual-block-id={blockId}` to the card root** so every rendered block surface
  carries exactly one block-id.
- `web/src/components/visual/*`: **unchanged** — they remain the sole emitter of `data-visual-block-id`
  (leaf root) and `data-semantic-node-id` (per node).

Result: `querySelectorAll('[data-visual-block-id="X"]')` returns exactly one element per block.

### 6.2 Mechanism — imperative DOM class toggling via event delegation (no React render-path work)

**ARCH DECISION — pure CSS-class toggling driven by one delegated controller on the room root; NOT React
state.** The visual nodes live in the ProseMirror NodeView subtree and the comment cards live in the
rail — two disjoint React subtrees. Lifting hover state into `DecisionRoomApp` would re-render the editor
(and xyflow) on every hover — the exact render-storm the project already fixed once
(`HOVER_SWITCH_DELAY`, per handoff). Event delegation with `Element.closest()` keeps hover/click entirely
off the React render path and requires **zero changes to the Phase-5 leaf components** (they already emit
`data-semantic-node-id`).

New module **`web/src/components/decision-room/useCommentLinks.ts`** — a hook
`useCommentLinks({ rootRef, comments, currentArtifactId, onSelectComment, onStartComment })`:

1. **Delegated listeners** on `rootRef.current` (added in `useEffect`, cleaned up on unmount; deps that
   change identity are read through a ref so the listeners are not re-bound per render):
   - `mouseover` / `mouseout`: `const el = e.target.closest('[data-semantic-node-id]')`; if found, read
     its node id `N` and toggle class `dr-link-active` on **all** `[data-semantic-node-id="${N}"]`
     (nodes, possibly several across tabs) **and** `[data-comment-target-node-id="${N}"]` (cards). Also
     handle the reverse origin: `e.target.closest('[data-comment-id]')` → read its
     `data-comment-target-node-id` → same toggle.
   - `click`: `const el = e.target.closest('[data-semantic-node-id]')` inside the canvas → let `N` be its
     id. If any comment targets `N`, call `onSelectComment(firstCommentIdForNode(N))` (reuses existing
     `handleSelectComment` — focuses + scrolls the card). If none, call `onStartComment({ semanticNodeId:
     N, visualBlockId: <nearest data-visual-block-id>, artifactId: currentArtifactId, nodeKind, nodeLabel
     })` to open the composer with a pending semantic anchor (§3).
2. **Badge stamping** (requirement 7): in a `useEffect` keyed on `comments` + artifact, query
   `[data-semantic-node-id]` under `rootRef` and set `data-comment-count="<n>"` on each, where **n =
   count of OPEN comments whose semantic target is that node id** (ARCH DECISION: open only — a resolved
   badge is noise). CSS draws the badge from the attribute; no React node touches the leaves:

   ```css
   [data-semantic-node-id][data-comment-count]:not([data-comment-count="0"])::after {
     content: attr(data-comment-count);
     /* small pill, --dr accent, positioned top-right; see decision-room.css */
   }
   ```

**ARCH DECISION — click-to-comment on graph (xyflow) nodes is best-effort.** `FlowCardNode` emits
`data-semantic-node-id`, so hover-highlight and click-delegation work there too, but if xyflow intercepts
a click during pan the user can still comment via card focus or the Source tab. Card-based tabs
(Brief/Tradeoffs/Risks/Actions) are the reliable creation surface. Do not fight xyflow's event handling
in v1.

`rootRef` must wrap **both** panes (canvas + rail) so a card hover can light a canvas node.
`DecisionRoomLayout` accepts a `rootRef` prop and attaches it to its 3-pane root; `DecisionRoomApp` owns
the ref and mounts `useCommentLinks`.

Comment cards (new `ReviewRail`) must render `data-comment-id={c.id}` and, for semantic targets,
`data-comment-target-node-id={c.target.semanticNodeId}`. Text/element targets omit the latter (no reverse
link — acceptable).

---

## 7. "Resolved with change in vN" (requirement 6)

Extend the existing resolution/history model (§2). The live path is the inline handler in
`DecisionRoomApp.handleResolveComment` — apply the change there AND in the app `resolveComment` fn so
they stay parallel:

- On resolve, set `resolution.resolvedInVersion = activeVersionNum` and, for semantic targets,
  `resolution.semanticNodeId = target.semanticNodeId`.
- History event text includes the version: `resolved (content edited) in v${n}` /
  `resolved (no change) in v${n}`.
- The rail's Resolved group renders "Resolved in v3" (and, if `changeLink` present, keeps the existing
  before/after change-link affordance from the spike model). No read/seen/opened metadata is added
  anywhere (tenet #3, PRD §10.5).

---

## 8. UI copy + counts (requirement 7)

In scope: per-node comment-count badge (§6.2) and per-group counts in rail headers
(`Blockers (2)`). Out of scope and explicitly forbidden: anything resembling engagement analytics —
who-viewed, read-receipts, seen-by, time-on-node, open counts per user (PRD §6 tenet #3, §10.5). The
badge counts *comments*, an authored artifact, never *views*. Empty state and vocabulary strings follow
main brief §10 ("Decision status", "Import your first strategy memo").

---

## 9. Storage / RBAC (requirement 9)

**No API shape change.** Comments (now possibly carrying `SemanticCommentTarget`) ride the existing
`comments` key in the `collab_state` blob, already in `MERGEABLE_KEYS`
(`web/src/app/api/collab/route.ts`). `SemanticCommentTarget` is plain JSON — it round-trips through the
blob losslessly (tested in §10). `canComment`-gating for the `comments`/`verdicts` keys is unchanged;
filters/hover/badges are client-only and touch no endpoint. `syncState` continues to POST the full
`comments` array. Confirmed: nothing in this phase requires editing `route.ts` or any API route.

---

## 10. Deterministic tests (app vitest — offline, no keys) — requirement 8

Add `app/tests/collab/review.test.ts` and extend `app/tests/collab/comments.test.ts`. Enumerate:

1. **Semantic target validation** (`resolveSemanticTarget`): anchored when the node exists; orphaned when
   the node id is absent; orphaned when `artifactId` mismatches; returned `node` identity is correct.
2. **`locate()` semantic guard**: a comment with a `type:'semantic'` target returns
   `{ status: 'orphaned' }` and does not touch the DOM branch.
3. **Grouping function** (`groupOfComment`): one case per rule row — resolved-wins (even for a `flag` on
   a risk), `flag`→blockers, `risk`/`assumption` kind→risks, `question` kind→questions, `action`→actions,
   `decision`/`option`/`tradeoff`→decisions, `needs` feedback + no kind→questions, general fallback
   (null feedback, text target)→decisions.
4. **Filter predicates**: `unresolved`, `mine` (author match / non-match), `blockers`, `stale`
   (`stale` and `orphaned` both pass; `anchored` fails), and an AND-combination (a comment passing some
   but not all active filters is excluded).
5. **Fallback selection** (`buildCommentTarget`): semantic gesture → `type:'semantic'`; text-only →
   `type:'text'`; section-only → `type:'element'`; precedence (semantic beats text beats section when
   more than one is present); empty gesture throws.
6. **Resolved-in-vN**: `resolveComment(id, changeLink, 3)` sets `resolution.resolvedInVersion === 3`,
   sets `resolution.semanticNodeId` for a semantic-target comment, and the pushed history event text
   contains `v3`; the no-version call path is unchanged.
7. **Serialization round-trip**: a `Comment` with a `SemanticCommentTarget` (all optional fields set and
   unset) satisfies `deepEqual(JSON.parse(JSON.stringify(c)), c)` — guards blob storage.

All pure and key-free. No web test runner is added (main-brief C4) — hover/badge DOM behavior is verified
in-browser at the Gate.

---

## 11. Build order & module map

Two builders. Wave app is a hard gate before Wave web (`cd app && npm run build` + dist rebuilt).

**Wave app (COLLAB-001 + pure logic + tests).**
- `app/src/collab/comments.ts` — `SemanticCommentTarget`, union join, `resolveSemanticTarget`,
  `locate()` guard, `Resolution` fields, `resolveComment(versionNumber?)`.
- `app/src/collab/review.ts` (NEW) — `ReviewGroup` + order/labels, `groupOfComment`,
  `REVIEW_FILTER_PREDICATES`, `buildCommentTarget`, `CommentGesture`. Barrel it from
  `app/src/collab/index.ts` (`export * from './review.js';`).
- `app/tests/collab/review.test.ts` (NEW) + additions to `comments.test.ts` (§10).
- **Gate app:** `npm run typecheck && npm run build` green; full vitest suite passes offline; new
  `htmlcollab-app/collab` exports resolve. Rebuild `app/dist` before any web work.

**Wave web — BACK-008 FIRST, then COLLAB-002/003/004.**
1. **BACK-008** (§6.1): edit `web/src/components/tiptap/VisualBlockNodeView.tsx` only. Verify one
   `[data-visual-block-id]` per block in `/preview/canvas`.
2. `web/src/components/decision-room/useCommentLinks.ts` (NEW) — the delegation controller + badge
   stamping (§6.2).
3. `web/src/components/decision-room/ReviewRail.tsx` (REPLACE the 4-line wrapper) — the new light,
   grouped, filterable rail: filter toggle bar, `REVIEW_GROUP_ORDER` sections with counts, cards
   emitting `data-comment-id` / `data-comment-target-node-id`, semantic-anchored composer, resolve
   showing "Resolved in vN". Consumes the app's `groupOfComment` / filters. Styled with `--dr-*` tokens.
4. `web/src/app/decision-room.css` — new `.dr-link-active`, badge `::after`, and rail group/filter/card
   classes (light only; no dark/glass/gradient/glow).
5. `web/src/components/decision-room/DecisionRoomLayout.tsx` — accept + attach `rootRef`.
6. `web/src/components/decision-room/DecisionRoomApp.tsx` — add `pendingSemanticAnchor` state; route the
   rail (`semanticArtifact ? <ReviewRail/> : <CommentSidebar/>`); mount `useCommentLinks`; switch
   `handleAddComment` to `buildCommentTarget`; thread `activeVersionNum` into resolve; **fix
   `handleCommitAiEdit`'s re-anchor loop to skip `target.type === 'semantic'` comments unchanged**
   (§2 amendment — otherwise AI edits orphan all semantic comments).

**REUSED, untouched:** `DocumentSurface`, the legacy `CommentSidebar` (legacy-doc rail), all
`web/src/components/visual/*` leaf components, all `web/src/app/api/collab/*` routes, `TopDecisionBar`,
`VisualTabs`, `WorkspaceNav`, `EmptyState`, `SemanticArtifactEditor`, `SemanticArtifactContext`.

**Gate web:** `web` `tsc` + prod build green; app suite green (post-dist-rebuild); in-browser on the
founder-memo room — comment a canvas node (semantic target created), rail groups it correctly, filters
work, hover a card lights the node and vice-versa, node badge shows the count, resolve records "in vN";
legacy doc still opens on `DocumentSurface` with the old rail; render-storm check (hovering many
nodes/cards does not re-render the editor — the poll-pause + delegation keep it off the React path).

---

## 12. Reviewer checklist (enforced later)

- **app-side:** no React/DOM globals in `app/src`; `review.ts` added to the `./collab` barrel; `.js`
  import extensions; semantic imports are **type-only** (no runtime cycle); `groupOfComment` /
  predicates / `buildCommentTarget` / `resolveSemanticTarget` are pure and total; grouping precedence
  matches §4 exactly; `resolveComment` stays backward-compatible; new vitest offline; ends with
  `npm run build`.
- **web-side:** BACK-008 landed — exactly one `[data-visual-block-id]` per block, leaf-owned; hover/badge
  logic is imperative delegation, **no per-hover React state in `DecisionRoomApp`** (grep for new hover
  state hooks — there must be none); `useCommentLinks` cleans up listeners on unmount and reads volatile
  deps via ref (poll-pattern parity); new rail is decision-room-only, legacy `CommentSidebar` untouched;
  rail is **light** (grep new CSS for `backdrop-filter`, `linear-gradient`, glow, dark `#1e293b`/slate-900
  surfaces — none); filters not persisted / not sent to any endpoint; badge counts comments, never views;
  semantic composer builds a `SemanticCommentTarget` via `buildCommentTarget`; resolve records
  `resolvedInVersion`.
- **cross-cutting:** dist rebuilt before web tests; no API route diff; no seeding of comments/verdicts
  for new docs (ROOM-005 stays); tenet #3 — nothing that could become a read-receipt;
  `handleCommitAiEdit` re-anchor loop skips semantic-target comments (§2 amendment) — verify with an
  AI-edit commit that a semantic comment's `anchorStatus` stays `anchored`.

---

## 13. Non-goals (do not build in Phase 7)

No live co-editing or presence (PRD §7, async/version-based only). No notifications redesign (the
existing `NotificationRecord`/@mention path is untouched). No Phase-8 agent features (AgentBrief, "ask
this room"). No Phase-9 persistence migration (comments stay in the blob) and **no artifact versioning**
(§2). No mention-based rail filter. No dark/glass/gradient styling — the new rail is light per
`decision-room.css` tokens (retires BACK-016 for decision rooms; the convert/create/sandbox modals and
tour toast remain deferred to Phase 10). No re-anchoring of semantic comments across a re-import
(re-import = new doc; comments do not migrate).
```
