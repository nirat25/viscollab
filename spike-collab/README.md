# Collaboration spike — anchored comments survive edits

De-risks the **new hard bet** (plan-mod #3): in a hybrid edit model (author edits the
artifact directly, reviewers review), can a reviewer's comment stay attached to the right
content across author edits? Get this wrong and the collaboration layer — the product's
differentiator — is untrustworthy.

Self-contained, **no API key, no build**. Pure client-side.

## Model (researched best practice — `../docs/comment-lifecycle-research.md`)
**Two orthogonal axes**, never conflated:
- **lifecycle:** `open → resolved → reopened` (reversible; delete separate)
- **anchorStatus:** `anchored | stale | orphaned` (recomputed every render)

**Two anchor types, one model** (`target.type`):
- **`text`** — text-quote (`quote` + `prefix`/`suffix`). Precise, span-level.
- **`element`** — devtools-style **picker** (hover-outline + click), replicating the preview
  "select element" tool. Anchors a whole section/card/table/heading. One click, low friction.
  Re-anchor by `id` → structural `path` → content `hash`; orphan only if the element is gone —
  so element annotations are **more durable** than text (survive text edits a quote would lose).
  Carries **structured reader feedback**: approve / flag / needs-data / question.

### Text-quote re-anchor chain
- exact quote found (disambiguated by prefix/suffix if repeated) → **anchored**
- quote gone but prefix+suffix still bracket a region → **stale** (we know where it was *and* the new text)
- quote edited in place *and* context shifted → **fuzzy** (Sørensen–Dice on char bigrams, `FUZZY_THRESHOLD=0.6`) re-anchors to the best approximate match → **stale**
- nothing above threshold → **orphaned** (preserve last-known context; offer manual re-attach). Never silently re-point (GitHub/Hypothesis rule).

**Lifecycle UX:** resolve/reopen, per-comment **history** (who/when event log), filter tabs
(Open / Resolved / Needs re-anchoring). Highlight via CSS Custom Highlight API (no DOM mutation).

**Threads + @mentions (PRD P2-T4):** every comment/feedback is a thread — inline **replies**;
**@mentions** (autocomplete on `@`, parsed + highlighted) write a **notification record**
`{to, by, commentId, replyId, snippet, read}`. Header **🔔 bell** shows the current user's unread
count; opening the panel marks them read. Two mock users (Reader = Alex, Author = Nirat) to
demonstrate cross-user mentions; self-mentions are suppressed.

**Reader sign-off (alignment north-star):** per-reader verdict in the rail — Approve / Request
changes / Block — with an all-members roster. The actual sign-off signal the product exists to capture.

**Load artifact (end-to-end loop):** the **Load artifact** button injects a converted
`spike/out/*.html` into the review surface — so the whole thesis runs on one screen
(upload doc → convert → review/feedback/sign-off on the artifact). Loading resets review state
for the new document; persists across reload. Verified: real converted artifact loaded, text +
element anchoring work on it. (Delete comments: per-comment **Delete** + **Clear resolved**.)

**Differentiators built in:**
- **Manual re-attach** — click Re-attach on a stale/orphaned comment, select new text, it rebinds.
- **"Addressed (content edited)"** — on resolve, if the anchored text changed, the resolution
  shows **before/after** so a reviewer sees exactly what their comment caused. No incumbent has this.

## Run
```
python -m http.server 8123 --directory spike-collab
# open http://localhost:8123/index.html  (recent Chrome/Edge/Firefox — needs CSS Highlight API)
```
- **Reader**: select text → popup → add a comment. Comments listed in the rail; click to highlight.
- **Author** → **Edit mode**: edit the artifact inline. Turn Edit mode off → comments re-anchor.

## Verified end-to-end (driven via preview, 2026-05-30)
Text anchoring:
- ✅ survives **unrelated** edit; own target edit (`~46%`→`~52%`) → **stale** w/ new text; context deleted → **orphaned**
- ✅ repeated text ("Vendor A" ×2) → correct occurrence via prefix/suffix
Element anchoring:
- ✅ element feedback created via picker (table=Flag, heading=Needs data) with colored badges + outlines
- ✅ cell edit inside table → **stale** (still located by id); structural insert before table → **anchored** (re-anchored by id); table deleted → **orphaned**
Lifecycle (both types):
- ✅ resolve/reopen + history log; resolve-while-edited → **"Addressed (content edited)"** before/after
- ✅ **manual re-attach** — text comments rebind to a new selection; element feedback rebinds via a new pick
Threads + @mentions (P2-T4):
- ✅ reply added to a thread (author recorded, history `reply added`)
- ✅ @mentions parsed from root + reply bodies (`@Nirat`/`@priya`), highlighted; self-mention suppressed
- ✅ each mention writes a **notification record**; bell shows per-user unread (Alex:1, Nirat:1), opening marks read → 0
Anchoring hardening:
- ✅ fuzzy tier: quote edited + context rewritten → **stale** (score 0.85); unrelated replacement → **orphaned** (threshold guardrail); tiny in-span edit → **stale**
Reader sign-off:
- ✅ per-reader verdict set/toggle, all-members roster, persists across reload

> Note: functional verification driven via the preview `__spike` debug handle (the stronger check); screenshot capture was flaky in this run.

## Known spike limits (production concerns, not yet built)
- Anchoring is whole-document text search — fine at this size; production scopes per block
- Fuzzy is Dice-coefficient (good enough); production may want diff-match-patch/Bitap for longer spans
- Single-user (no concurrent sessions — intentional, no live co-editing, anti-scope §7)
- Identity is two mock members + role-as-user; real workspace identity/permissions later
- Persistence is `localStorage`; notifications are records only (no delivery)
