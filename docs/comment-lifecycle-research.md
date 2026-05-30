# Comment Lifecycle — competitive research & recommendation
*2026-05-30. Source: web research across Google Docs, Word/M365, Figma, Notion, Confluence, GitHub, GitLab, Hypothesis, Acrobat, Paper/Quip. Drives the Viscollab collaboration layer.*

## Two problems researched
1. **Resolution / history** — when a comment is acted on, keep it in history shown as "done", not deleted.
2. **Orphaned / stale** — what happens to a comment when its anchored content is edited/deleted.

## Consensus

**Resolution (P1):**
- **Resolve ≠ delete, everywhere.** Resolved = collapsed/greyed off the document surface, **retained in a "resolved" list / history panel**, **reopenable**. Delete is a separate, destructive, usually-permanent action.
- **Audit (who resolved + when)** is standard in GitHub, Figma, Acrobat; weaker in Google/Word/Notion.
- **"This comment caused this change" is NOT a first-class concept in any tool** — closest is Acrobat "Completed" status, GitHub resolve-on-commit, GitLab promote-to-issue. **This is an ownable gap for us.**

**Orphan handling (P2) — two philosophies:**
| Philosophy | Tools | Behavior |
|---|---|---|
| **Preserve + flag, never silently re-point** ✅ best practice | GitHub, GitLab, **Hypothesis** | mark Outdated/Orphaned, keep last-known context, surface in a separate view |
| Auto-resolve / auto-destroy ❌ avoid | **Word** (deletes comment with text), **Confluence** (auto-resolves on edit, over-fires on cut/paste) | |
| Follow object identity | Figma, Acrobat | anchor to object/coords; N/A for text |

- **Load-bearing rule both good tools honor: NEVER silently attach a comment to possibly-wrong text.** GitHub refuses to re-anchor (changed line = "outdated", full stop). Hypothesis attempts fuzzy re-anchor (verify quote between fuzzy-matched prefix/suffix) and **orphans only on total failure** → dedicated **Orphans tab**.
- Hypothesis stores **redundant W3C selectors**: TextQuoteSelector (exact + ~32ch prefix/suffix) + TextPositionSelector (offsets) + RangeSelector (xpath). Fuzzy via diff-match-patch/Bitap. (Real scale: ~27% of annotations orphaned, ~61% at risk on live pages.)

## Recommended model for Viscollab
Text-quote anchors on an author-editable HTML artifact ≈ the **Hypothesis anchoring problem + GitHub "outdated" UX**. Adopt preserve-and-flag; reject Word/Confluence patterns.

**Two ORTHOGONAL axes (do not conflate — Confluence's mistake):**
- **Lifecycle:** `open → resolved → (reopened)`; `deleted` separate + destructive (prefer soft-delete/trash).
- **Anchor health:** `anchored | stale | orphaned`, tracked independently. A comment can be open+orphaned or resolved+anchored.

**Anchoring:** store redundant selectors (textQuote primary — already in spike — + textPosition). On each edit re-run chain: exact quote → position → context-first fuzzy (verify quote between prefix/suffix) → quote-only fuzzy. **Below confidence threshold → mark orphaned, do NOT re-anchor.** Optional `stale` ("anchor moved — verify?") when a fuzzy match relocates.

**Resolved UX:** collapse + de-highlight, retain in "Resolved" filter, reopenable, record `resolvedBy/resolvedAt`.

**Orphan UX:** never delete/auto-resolve on edit. Orphans → dedicated "Needs re-anchoring" view, each preserving `lastKnownContext` (original quote + snapshot). Offer **manual re-attach to selection** — the safe escape hatch no big tool does well = **differentiator**.

**"Comment led to a change" (the gap to own):** when a comment is resolved AND its anchored text changed between open→resolve, link the resolution to the edit — store before/after of the span, label **"Addressed (content edited)"** vs **"Resolved (no change)."** Turns author-edits-directly into a visible payoff: reviewers see exactly what their comment caused.

**Data model (composite):**
```
Comment {
  id, body, author, createdAt
  lifecycle: open | resolved | deleted
  anchorStatus: anchored | stale | orphaned
  resolution?: { resolvedBy, resolvedAt, reason, changeLink?: {before, after} }
  target: { textQuote:{exact,prefix,suffix}, textPosition?:{start,end} }
  lastKnownContext
  thread: [replies]
  history: [ {event, who, when} ]   // created, resolved/reopened, deleted/restored, anchor transitions
}
```

## Avoid
- Word: deletes comments when anchored text is deleted.
- Confluence: auto-resolve-on-edit over-fires (false positives on cut/paste + version revert).

## Key sources
- Hypothesis: web.hypothes.is/blog/fuzzy-anchoring/ · web.hypothes.is/blog/showing-orphaned-annotations/
- GitHub: docs.github.com Reviewing proposed changes · github.blog/changelog/2018-08-31-resolvable-conversations/
- GitLab: docs.gitlab.com/user/discussions/
- Confluence anti-pattern: jira.atlassian.com/browse/CONFCLOUD-74118
- Figma: help.figma.com View and manage comments · Word/M365: support.microsoft.com modern comments · Acrobat: helpx.adobe.com Commenting on PDFs
