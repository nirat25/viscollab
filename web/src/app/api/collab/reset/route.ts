import { NextResponse } from "next/server";
import { saveState, saveUsers, hashPassword, saveDocuments } from "../db";
import fs from "fs";
import path from "path";

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

export async function POST() {
  try {
    const SEEDS_DIR = path.join(process.cwd(), "data", "seeds");
    const sampleHtmlPath = path.join(SEEDS_DIR, "sample.html");
    const dentalTechHubHtmlPath = path.join(SEEDS_DIR, "dentaltechhub.html");

    let sampleHtml = INITIAL_HTML;
    if (fs.existsSync(sampleHtmlPath)) {
      sampleHtml = fs.readFileSync(sampleHtmlPath, "utf-8");
    }

    let dentalTechHubHtml = "";
    if (fs.existsSync(dentalTechHubHtmlPath)) {
      dentalTechHubHtml = fs.readFileSync(dentalTechHubHtmlPath, "utf-8");
    } else {
      throw new Error(`dentaltechhub.html seed file not found at ${dentalTechHubHtmlPath}`);
    }

    const stateForDoc1 = {
      versions: [
        {
          versionNumber: 1,
          html: sampleHtml,
          status: "Draft",
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
      }
    };

    const stateForDoc2 = {
      versions: [
        {
          versionNumber: 1,
          html: dentalTechHubHtml,
          status: "Draft",
          timestamp: new Date().toISOString()
        }
      ],
      activeVersionNum: 1,
      comments: [
        createMockComment(
          "d1",
          "Priya",
          "Selecting the right technology solution to address a specific practice need",
          "Does this also include custom software development or just off-the-shelf SaaS packages? @sam",
          "lead",
          "question"
        ),
        createMockComment(
          "d2",
          "Sam",
          "highest-leverage opportunity sits in Steps 4–8",
          "Agreed, we should prioritize our product roadmap specifically around discovery and screening features first.",
          "opportunity",
          "approve"
        ),
        createMockComment(
          "d3",
          "Alex",
          "Fragmented info, biased sources, no central hub",
          "We need to ensure our directory has verified user feedback and is not biased by sponsored listings. @nirat",
          "opportunity",
          "flag"
        )
      ],
      verdicts: {
        "Sam": null,
        "Alex": null,
        "Priya": null,
        "Nirat": null
      }
    };

    const INITIAL_USERS = [
      { username: "Sam", role: "owner", token: "token-owner", passwordHash: hashPassword("password") },
      { username: "Nirat", role: "collaborator", token: "token-collaborator", passwordHash: hashPassword("password") },
      { username: "Priya", role: "commenter", token: "token-commenter", passwordHash: hashPassword("password") },
      { username: "Alex", role: "viewer", token: "token-viewer", passwordHash: hashPassword("password") },
    ];

    const initialDocs = [
      { id: "doc-1", name: "Vendor Consolidation Brief", createdAt: new Date().toISOString() },
      { id: "doc-2", name: "DentalTechHub JTBD Analysis", createdAt: new Date().toISOString() }
    ];

    await saveDocuments(initialDocs);
    await saveState(stateForDoc1, "doc-1");
    await saveState(stateForDoc1); // Generic default state fallback
    await saveState(stateForDoc2, "doc-2");
    await saveUsers(INITIAL_USERS);

    return NextResponse.json({ success: true, message: "Database reset to initial seeds with two documents" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to reset database" }, { status: 500 });
  }
}
