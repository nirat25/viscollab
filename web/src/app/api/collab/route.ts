import { NextResponse } from "next/server";
import { getState, saveState, getDocumentRole } from "./db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/options";
import { canEdit, canComment } from "htmlcollab-app/collab";
import { testSessionFallback } from "./testAuth";



const INITIAL_HTML = `
<style>
  .vcd-wrap {
    font-family: Georgia, 'Times New Roman', serif;
    max-width: 680px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
    color: #1a1a1a;
    line-height: 1.55;
  }

  .vcd-bluf {
    background: #f7f7f0;
    border-left: 4px solid #2a6e3f;
    padding: 1rem 1.25rem;
    margin-bottom: 1.75rem;
    border-radius: 0 4px 4px 0;
  }

  .vcd-bluf .label {
    font-size: 0.7rem;
    font-weight: bold;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #2a6e3f;
    margin-bottom: 0.35rem;
  }

  .vcd-bluf .headline {
    font-size: 1.25rem;
    font-weight: bold;
    margin: 0 0 0.25rem 0;
    color: #111;
  }

  .vcd-bluf .subhead {
    font-size: 0.95rem;
    color: #333;
    margin: 0;
  }

  .vcd-section-title {
    font-size: 0.72rem;
    font-weight: bold;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #666;
    border-bottom: 1px solid #ddd;
    padding-bottom: 0.3rem;
    margin: 1.75rem 0 0.85rem 0;
  }

  .vcd-actions {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .vcd-actions li {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    padding: 0.45rem 0;
    border-bottom: 1px dotted #ddd;
    font-size: 0.97rem;
  }

  .vcd-actions li:last-child {
    border-bottom: none;
  }

  .badge {
    font-size: 0.68rem;
    font-weight: bold;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    border-radius: 3px;
    padding: 0.1em 0.45em;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .badge-primary {
    background: #2a6e3f;
    color: #fff;
  }

  .badge-secondary {
    background: #dde8e1;
    color: #2a6e3f;
  }

  .vcd-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
    margin-top: 0.5rem;
  }

  .vcd-table thead tr {
    background: #f0f0ea;
  }

  .vcd-table th {
    text-align: left;
    padding: 0.5rem 0.75rem;
    font-size: 0.72rem;
    font-weight: bold;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #555;
  }

  .vcd-table td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #eee;
    color: #222;
  }

  .vcd-table tr.highlight td {
    font-weight: bold;
    color: #2a6e3f;
    background: #f4faf6;
  }

  .vcd-table .cost {
    font-variant-numeric: tabular-nums;
    font-family: 'Courier New', monospace;
  }

  details.vcd-detail {
    margin-top: 1.5rem;
    border: 1px solid #e0e0d8;
    border-radius: 4px;
    overflow: hidden;
  }

  details.vcd-detail summary {
    cursor: pointer;
    padding: 0.65rem 1rem;
    font-size: 0.85rem;
    font-weight: bold;
    color: #2a6e3f;
    background: #f7f7f0;
    list-style: none;
    user-select: none;
  }

  details.vcd-detail summary::-webkit-details-marker { display: none; }

  details.vcd-detail summary::before {
    content: '▶ ';
    font-size: 0.65rem;
    vertical-align: middle;
  }

  details.vcd-detail[open] summary::before {
    content: '▼ ';
  }

  details.vcd-detail .detail-body {
    padding: 0.85rem 1rem;
    font-size: 0.92rem;
    color: #333;
    background: #fff;
  }

  .vcd-footer {
    margin-top: 2rem;
    font-size: 0.8rem;
    color: #999;
    border-top: 1px solid #eee;
    padding-top: 0.75rem;
  }
</style>

<div class="vcd-wrap" id="top">

  <!-- BLUF -->
  <div class="vcd-bluf">
    <div class="label">Bottom Line</div>
    <div class="headline">Consolidate to Vendor A — saves $120k/year</div>
    <p class="subhead">Engineering currently runs three overlapping analytics vendors. Consolidating onto Vendor A this quarter eliminates redundancy and reduces integration overhead.</p>
  </div>

  <!-- Required Actions -->
  <div class="vcd-section-title" id="actions">Required Actions</div>
  <ul class="vcd-actions">
    <li>
      <span class="badge badge-primary">This Quarter</span>
      Consolidate onto Vendor A
    </li>
    <li>
      <span class="badge badge-secondary">By End of Q3</span>
      Migrate all reporting dashboards to Vendor A
    </li>
    <li>
      <span class="badge badge-secondary">Concurrent</span>
      Negotiate a volume discount with Vendor A
    </li>
  </ul>

  <!-- Cost Comparison -->
  <div class="vcd-section-title" id="cost">Cost Comparison</div>
  <table class="vcd-table">
    <thead>
      <tr>
        <th>Vendor</th>
        <th>Monthly Cost</th>
        <th>Features</th>
      </tr>
    </thead>
    <tbody>
      <tr class="highlight">
        <td>Vendor A <em title="Recommended vendor">(Recommended)</em></td>
        <td class="cost">$8,000</td>
        <td>Full suite</td>
      </tr>
      <tr>
        <td>Vendor B</td>
        <td class="cost">$5,000</td>
        <td>Limited reporting</td>
      </tr>
    </tbody>
  </table>

  <!-- Background -->
  <details class="vcd-detail" id="background">
    <summary>Background &amp; Context</summary>
    <div class="detail-body">
      <p>The engineering team currently manages <strong>three separate analytics vendors</strong> with significant overlap in capabilities. This consolidation recommendation addresses that redundancy.</p>
    </div>
  </details>

  <div class="vcd-footer">
    <a href="#top">↑ Back to top</a> &nbsp;·&nbsp;
    <a href="#actions">Actions</a> &nbsp;·&nbsp;
    <a href="#cost">Cost Comparison</a> &nbsp;·&nbsp;
    <a href="#background">Background</a>
  </div>

</div>
`.trim();

function createMockComment(
  id: string,
  author: string,
  quote: string,
  body: string,
  sectionId: string,
  feedbackType: "approve" | "flag" | "needs" | "question" | null
) {
  return {
    id,
    versionId: "v1",
    author,
    body,
    createdAt: Date.now(),
    feedbackType,
    lifecycle: "open",
    anchorStatus: "anchored",
    target: {
      type: "text",
      quote,
      prefix: "",
      suffix: ""
    },
    lastKnownContext: quote,
    resolution: null,
    replies: [],
    mentions: [],
    history: [{ event: "created", who: author, when: Date.now() }]
  };
}

const SEED_COMMENTS = [
  createMockComment(
    "c1",
    "Priya",
    "three separate analytics vendors",
    "Is the reliance on three separate analytics vendors backed by baseline data or is it a projection? @nirat needs-data",
    "background",
    "needs"
  ),
  createMockComment(
    "c2",
    "Sam",
    "Consolidate onto Vendor A",
    "Highly ambitious target, let's make sure our sales pipeline is aligned.",
    "actions",
    "approve"
  ),
  createMockComment(
    "c3",
    "Alex",
    "volume discount",
    "We should specify volume discount standards explicitly. @sam",
    "actions",
    "flag"
  )
];

const INITIAL_STATE = {
  versions: [
    {
      versionNumber: 1,
      html: INITIAL_HTML,
      timestamp: new Date().toISOString()
    }
  ],
  activeVersionNum: 1,
  comments: SEED_COMMENTS,
  verdicts: {
    "Sam": "approve",
    "Alex": null,
    "Priya": null,
    "Nirat": null
  },
  notifications: [],
  lockedSections: []
};

// Keys that clients are allowed to partially update.
// Any subset of these may be sent; missing keys are left unchanged.
const MERGEABLE_KEYS = ["versions", "activeVersionNum", "comments", "verdicts", "notifications", "lockedSections", "semanticArtifact", "visualPlan"] as const;
type MergeableKey = typeof MERGEABLE_KEYS[number];

export async function GET(request: Request) {
  let session = await getServerSession(authOptions);
  if (!session) {
    session = testSessionFallback();
  }
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId") || undefined;

  // IDOR guard: reading a specific document requires membership in it.
  // (Legacy demo docs doc-1/doc-2 seed all demo users as members, so those
  // still work.) The default/no-documentId state is a generic demo fallback
  // with no document to scope against.
  if (documentId) {
    const docRole = await getDocumentRole(documentId, session.user.name || "");
    if (!docRole) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let state = await getState(documentId);
  if (!state) {
    state = { ...INITIAL_STATE };
    await saveState(state, documentId);
  }
  // Back-fill notifications and lockedSections for legacy stored states
  if (!Array.isArray(state.notifications)) {
    state.notifications = [];
  }
  if (!Array.isArray(state.lockedSections)) {
    state.lockedSections = [];
  }
  return NextResponse.json(state);
}

export async function POST(request: Request) {
  try {
    let session = await getServerSession(authOptions);
    if (!session) {
      session = testSessionFallback();
    }
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId") || undefined;
    const body = await request.json();

    // Write authorization is scoped to the requester's role IN this document,
    // NOT their global role. Not a member -> forbidden. For the generic
    // default state (no documentId) fall back to the global role.
    let role: any;
    if (documentId) {
      const docRole = await getDocumentRole(documentId, session.user.name || "");
      if (!docRole) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      role = docRole;
    } else {
      role = (session.user.role || "viewer") as any;
    }

    // -----------------------------------------------------------------------
    // Determine whether this is a full-blob update or a partial update.
    //
    // Full-blob (backward compat): client sends ALL four core keys.
    // Partial: client sends any non-empty subset of MERGEABLE_KEYS.
    //
    // The legacy validation required all four core keys to be present; we
    // keep that contract for clients that send all four.  Partial sends
    // (missing one or more) are now accepted and merged onto stored state.
    // -----------------------------------------------------------------------

    const sentKeys = MERGEABLE_KEYS.filter((k) => k in body);

    if (sentKeys.length === 0) {
      return NextResponse.json(
        { error: "Body must include at least one of: " + MERGEABLE_KEYS.join(", ") },
        { status: 400 }
      );
    }

    // Role capability assertions
    if (
      sentKeys.includes("versions") ||
      sentKeys.includes("lockedSections") ||
      sentKeys.includes("semanticArtifact") ||
      sentKeys.includes("visualPlan")
    ) {
      if (!canEdit(role)) {
        return NextResponse.json({ error: "Forbidden: role cannot edit" }, { status: 403 });
      }
    }

    if (sentKeys.includes("comments") || sentKeys.includes("verdicts")) {
      if (!canComment(role)) {
        return NextResponse.json({ error: "Forbidden: role cannot comment" }, { status: 403 });
      }
    }

    // Load existing state to merge into
    let stored = await getState(documentId);
    if (!stored) {
      stored = { ...INITIAL_STATE };
    }
    // Back-fill notifications on legacy stored state
    if (!Array.isArray(stored.notifications)) {
      stored.notifications = [];
    }

    // Merge: only update keys that were sent in this request
    const merged: Record<string, unknown> = { ...stored };
    for (const key of sentKeys) {
      merged[key] = body[key];
    }

    // Attach last-write metadata
    merged["updatedAt"] = new Date().toISOString();

    await saveState(merged, documentId);
    return NextResponse.json({ success: true, state: merged });
  } catch (e) {
    return NextResponse.json({ error: "Failed to parse body" }, { status: 500 });
  }
}

