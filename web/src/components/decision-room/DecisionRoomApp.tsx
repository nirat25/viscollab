"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Lock, CheckCircle2, AlertTriangle, MessageSquare,
  Sparkles, Check, X, ChevronRight, User, ThumbsUp, XOctagon,
  CornerDownRight, Calendar, Eye, CheckSquare, List, Send, FileText
} from "lucide-react";
import { diff_match_patch } from "diff-match-patch";
import { useSession, signOut } from "next-auth/react";

import {
  buildCommentTarget,
  type Comment,
  type CommentGesture
} from "htmlcollab-app/collab";
import type { Capability, DocumentStateV2 } from "htmlcollab-app/persistence";
import type { SemanticArtifact } from "htmlcollab-app/semantic";
import { planVisuals, type VisualPlan } from "htmlcollab-app/visual";
import DocumentSurface, { type PendingSelection } from "../DocumentSurface";
import CommentSidebar from "../CommentSidebar";
import AuthScreen from "../auth/AuthScreen";
import Header from "../Header";
import WorkspaceSettingsModal from "../WorkspaceSettingsModal";
import DecisionRoomLayout from "./DecisionRoomLayout";
import TopDecisionBar, { type DecisionVerdict } from "./TopDecisionBar";
import WorkspaceNav from "./WorkspaceNav";
import VisualTabs from "./VisualTabs";
import ReviewRail from "./ReviewRail";
import DecisionRoomExportButton from "./DecisionRoomExportButton";
import EmptyState from "./EmptyState";
import { useCommentLinks } from "./useCommentLinks";
import "@/app/decision-room.css";

// Token mapping has been moved to API server.
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

  /* --- Legacy AI Generated Toggles (Sections, Levers, QA) --- */
  .section-header, .lever-header, .qa-q {
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: #fdfdfc;
    border: 1px solid #e0e0d8;
    border-radius: 6px;
    margin-top: 1.25rem;
    margin-bottom: 0.25rem;
    transition: background 0.2s;
  }
  
  .section-header:hover, .lever-header:hover, .qa-q:hover {
    background: #f7f7f0;
  }

  .section-header.open, .lever-header.open, .qa-q.open {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-bottom: 1px solid transparent;
    margin-bottom: 0;
  }

  .section-body, .lever-body, .qa-a {
    display: none;
    padding: 1rem 1.25rem;
    border: 1px solid #e0e0d8;
    border-top: none;
    border-bottom-left-radius: 6px;
    border-bottom-right-radius: 6px;
    background: #fff;
    margin-bottom: 1.25rem;
  }

  .section-body.open, .lever-body.open, .qa-a.open {
    display: block;
    animation: fadeIn 0.2s ease-out;
  }

  .section-title, .lever-name, .qa-q-text {
    flex-grow: 1;
    font-weight: 700;
    font-size: 1.05rem;
    color: #2a6e3f;
  }

  .section-summary {
    font-size: 0.85rem;
    color: #666;
  }

  .chevron, .qa-chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    color: #888;
    font-size: 0.75rem;
  }

  .chevron.open, .qa-chevron.open {
    transform: rotate(90deg);
  }

  /* Specific styles for icons and tags */
  .section-icon, .qa-q-icon {
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    background: #f0f0ea;
    font-size: 1.1rem;
    flex-shrink: 0;
  }

  .lever-rank {
    font-family: 'Courier New', monospace;
    background: #2a6e3f;
    color: white;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-weight: bold;
    font-size: 0.8rem;
  }

  .lever-tag {
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
    background: #eef2ff;
    color: #4f46e5;
    border-radius: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
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

interface TourStepConfig {
  targetId: string;
  title: string;
  description: string;
  position: "right" | "left" | "bottom" | "top";
}

const TOUR_STEPS: TourStepConfig[] = [
  {
    targetId: "tour-sidebar",
    title: "Workspace Explorer",
    description: "Browse, search, and switch between documents. Create new documents or replay this tour from the footer.",
    position: "right"
  },
  {
    targetId: "tour-center-preview",
    title: "Interactive Document Preview",
    description: "Read the artifact, then select any text to pop up a Comment button — your comment is anchored to that exact passage and stays highlighted as the document evolves. Click a highlight to jump to its thread.",
    position: "bottom"
  },
  {
    targetId: "tour-section-tools",
    title: "Block & AI Sandbox Tools",
    description: "Hover a block to reveal a small toolbar in its top-right: comment on the whole section, or open the AI Sandbox to surgically rewrite just that block (with a diff preview before you commit).",
    position: "right"
  },
  {
    targetId: "tour-right-collab",
    title: "Collaboration Sidebar",
    description: "Participate in discussions, request changes, track decisions, and vote for document alignment.",
    position: "left"
  }
];

export default function DecisionRoomApp() {
  const [mounted, setMounted] = useState(false);

  // Document catalog and onboarding states
  const [documents, setDocuments] = useState<Array<{
    id: string; workspaceId: string; title: string; kind: "legacy" | "decision_room";
    revision: number; activeVersionNumber: number; archivedAt?: string;
  }>>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Array<{
    id: string; name: string; ownerAccountId: string; capabilities?: readonly Capability[];
  }>>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [isCreateDocModalOpen, setIsCreateDocModalOpen] = useState(false);
  const [isWorkspaceSettingsOpen, setIsWorkspaceSettingsOpen] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocHtml, setNewDocHtml] = useState("");
  const [newDocError, setNewDocError] = useState("");
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  
  // Auth state
  const { data: session } = useSession();
  // Phase 9 identity comes from the signed-in immutable account ID.  Roles
  // are deliberately not read from the session (or a document member blob):
  // server-derived capabilities are the only client affordance input.
  const accountId = typeof (session?.user as { accountId?: unknown } | undefined)?.accountId === "string"
    ? (session!.user as { accountId: string }).accountId
    : null;
  const currentUser = accountId && session?.user?.name
    ? { name: session.user.name, accountId }
    : null;
  const [capabilities, setCapabilities] = useState<readonly Capability[]>([]);
  const [roomRevision, setRoomRevision] = useState<number | null>(null);
  const [roomError, setRoomError] = useState("");
  const hasCapability = React.useCallback(
    (capability: Capability) => capabilities.includes(capability),
    [capabilities]
  );
  const capabilityRole: "owner" | "collaborator" | "commenter" | "viewer" = hasCapability("version.publish") ? "owner"
    : hasCapability("room.edit") ? "collaborator"
      : hasCapability("comment.create") ? "commenter" : "viewer";

  const activeDocumentUser = currentUser ? { name: currentUser.name, accountId: currentUser.accountId, role: capabilityRole } : null;

  // Workspace authority is a separate server-derived catalog projection; room
  // capabilities never imply it. Older server projections fall back only to
  // their explicit immutable ownerAccountId (an affordance, never a check).
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const canCreateDocInWorkspace = Boolean(activeWorkspace && (
    activeWorkspace.capabilities?.includes("workspace.create_document")
    || activeWorkspace.ownerAccountId === accountId
  ));

  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin");
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");

  // Document version state
  const [documentVersions, setDocumentVersions] = useState<{ versionNumber: number; html: string; status: "Draft" | "Live"; timestamp: string }[]>([
    {
      versionNumber: 1,
      html: INITIAL_HTML,
      status: "Draft",
      timestamp: new Date().toISOString()
    }
  ]);
  const [activeVersionNum, setActiveVersionNum] = useState(1);

  // Verdict states (Approve, Request Changes, Block)
  const [verdicts, setVerdicts] = useState<Record<string, DecisionVerdict>>({});

  // Semantic decision-room data (ROOM-002/003 wiring). Undefined for legacy
  // docs (no semanticArtifact) — the router picks DocumentSurface in that
  // case (brief §7.2 "Legacy remains reachable"). `visualPlan` is the
  // persisted plan when the server stored one; otherwise it is computed
  // client-side from `semanticArtifact` below.
  const [semanticArtifact, setSemanticArtifact] = useState<SemanticArtifact | undefined>(undefined);
  const [visualPlan, setVisualPlan] = useState<VisualPlan | undefined>(undefined);

  const effectivePlan = React.useMemo<VisualPlan | undefined>(() => {
    if (!semanticArtifact) return undefined;
    return visualPlan ?? planVisuals(semanticArtifact);
  }, [semanticArtifact, visualPlan]);

  // Comments, replies, notifications state
  // ROOM-005: new/legacy documents start unseeded on the client — the server
  // supplies seeds for legacy demo docs (INITIAL_STATE in
  // web/src/app/api/collab/route.ts); the client no longer hard-codes any.
  const [comments, setComments] = useState<Comment[]>([]);
  const [activeTab, setActiveTab] = useState<"threads" | "decisions" | "actions">("threads");
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);

  // Comment Form state
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [commentTargetSection, setCommentTargetSection] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentFeedbackType, setCommentFeedbackType] = useState<"approve" | "flag" | "needs" | "question" | null>("question");
  const [selectedText, setSelectedText] = useState("");
  const [selectedRange, setSelectedRange] = useState<{ quote: string; prefix: string; suffix: string } | null>(null);
  // Canvas-click gesture pending anchoring (COLLAB-002, brief §3) — set by
  // useCommentLinks' onStartComment, cleared whenever the composer closes
  // (submit or cancel, see the effect below).
  const [pendingSemanticAnchor, setPendingSemanticAnchor] = useState<NonNullable<CommentGesture["semantic"]> | null>(null);

  useEffect(() => {
    if (!isAddingComment) setPendingSemanticAnchor(null);
  }, [isAddingComment]);

  // Reply Form state — keyed per comment so threads don't share one buffer.
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  // AI Sandbox state
  const [sandboxSectionId, setSandboxSectionId] = useState<string | null>(null);
  const [sandboxPrompt, setSandboxPrompt] = useState("");
  const [sandboxSimulatedHtml, setSandboxSimulatedHtml] = useState<string | null>(null);
  const [sandboxDiffHtml, setSandboxDiffHtml] = useState<string | null>(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandboxIsSimulated, setSandboxIsSimulated] = useState(false);
  const [sandboxError, setSandboxError] = useState("");

  // Scroll container for the document review surface (owned here for in-page
  // anchor scrolling; the artifact DOM itself is owned by DocumentSurface).
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // 3-pane room root (COLLAB-004) — wraps BOTH the canvas and the review
  // rail so useCommentLinks' delegated hover/click can link a canvas node to
  // its comment card and back (brief §6.2).
  const roomRootRef = useRef<HTMLDivElement>(null);

  // Convert Document Modal states
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [convertOption, setConvertOption] = useState<"docx" | "paste">("docx");
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [pasteHtml, setPasteHtml] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [conversionStep, setConversionStep] = useState(0);
  const [convertError, setConvertError] = useState("");
  const [createHtmlOption, setCreateHtmlOption] = useState<"asis" | "refine">("asis");
  const [convertHtmlOption, setConvertHtmlOption] = useState<"asis" | "refine">("refine");

  useEffect(() => {
    if (typeof window !== "undefined" && activeDocumentId) {
      localStorage.setItem("vc_active_doc", activeDocumentId);
    }
  }, [activeDocumentId]);

  // True once the document list for the ACTIVE workspace has loaded at least
  // once — gates the empty state so a workspace with docs never flashes
  // "Import your first strategy memo." while the fetch is in flight.
  const [documentsLoaded, setDocumentsLoaded] = useState(false);

  const fetchDocuments = async (workspaceId: string) => {
    try {
      const res = await fetch(`/api/collab/documents?workspaceId=${workspaceId}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.documents)) {
        const catalog = data.documents as Array<{
          id: string; workspaceId: string; title: string; kind: "legacy" | "decision_room";
          revision: number; activeVersionNumber: number; archivedAt?: string;
        }>;
        setDocuments(catalog);
        // A local selection is a convenience only. Validate it against the
        // account-scoped catalog before reading a room; never fetch doc-1 or a
        // stale/revoked ID merely because it is in localStorage.
        const stored = typeof window === "undefined" ? null : localStorage.getItem("vc_active_doc");
        setActiveDocumentId((previous) => {
          const desired = previous ?? stored;
          if (desired && catalog.some((document) => document.id === desired)) return desired;
          return catalog[0]?.id ?? null;
        });
        setDocumentsLoaded(true);
      }
    } catch (e) {
      console.error("Failed to fetch documents", e);
    }
  };

  const fetchWorkspaces = async () => {
    try {
      const res = await fetch("/api/collab/workspaces");
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to fetch workspaces", e);
    }
  };

  const [lockedSections, setLockedSections] = useState<string[]>([]);

  const clearRoomState = React.useCallback(() => {
    setDocumentVersions([]);
    setComments([]);
    setVerdicts({});
    setSemanticArtifact(undefined);
    setVisualPlan(undefined);
    setLockedSections([]);
    setCapabilities([]);
    setRoomRevision(null);
  }, []);

  const applyRoomState = React.useCallback((state: DocumentStateV2) => {
    setDocumentVersions(state.versions.map((version) => ({
      versionNumber: version.versionNumber,
      html: version.html,
      status: version.status,
      timestamp: version.createdAt,
    })));
    setActiveVersionNum(state.activeVersionNumber);
    setComments([...state.comments]);
    setVerdicts(Object.fromEntries(state.verdicts.map((item) => [
      item.accountId === currentUser?.accountId ? currentUser.name : item.accountId,
      item.verdict,
    ])));
    // Phase 9 locks the source/version, not individual arbitrary DOM blocks.
    // The legacy section toolbar remains visually read-only after a lock via
    // the source-lock command path below.
    setLockedSections(state.versions.find((version) => version.versionNumber === state.activeVersionNumber)?.lockedAt
      ? ["__source_locked__"]
      : []);
    setSemanticArtifact(state.semanticArtifact);
    setVisualPlan(state.visualPlan);
    setCapabilities([...state.capabilities]);
    setRoomRevision(state.revision);
    setRoomError("");
    setSandboxSectionId(null);
    setSandboxSimulatedHtml(null);
    setSandboxDiffHtml(null);
  }, [currentUser]);

  const loadDocumentState = async (docId: string) => {
    try {
      const res = await fetch(`/api/collab?documentId=${docId}`);
      const data: unknown = await res.json();
      if (res.status === 401 || res.status === 403) {
        clearRoomState();
        setRoomError("You no longer have access to this room.");
        return false;
      }
      if (!res.ok || !data || typeof data !== "object" || (data as { schemaVersion?: unknown }).schemaVersion !== 2) {
        setRoomError("Unable to load this room right now.");
        return false;
      }
      applyRoomState(data as DocumentStateV2);
      return true;
    } catch (err) {
      console.error("Failed to load state for document", docId, err);
      setRoomError("Unable to load this room right now.");
      return false;
    }
  };

  const startTour = () => {
    setTourStep(0);
  };

  useEffect(() => {
    if (mounted && accountId && currentUser) {
      const tourCompleted = localStorage.getItem("onboarding_tour_completed");
      if (!tourCompleted) {
        startTour();
      }
    }
  }, [mounted, accountId, currentUser]);

  useEffect(() => {
    if (accountId) {
      fetchWorkspaces();
    }
    if (accountId && activeWorkspaceId) {
      setDocumentsLoaded(false);
      fetchDocuments(activeWorkspaceId);
    }
  }, [accountId, activeWorkspaceId]);

  useEffect(() => {
    if (!mounted || !accountId || !activeDocumentId) return;
    loadDocumentState(activeDocumentId);
  }, [activeDocumentId, mounted, accountId]);

  useEffect(() => {
    let timer1: NodeJS.Timeout;
    let timer2: NodeJS.Timeout;
    if (isConverting) {
      // Simulate pipeline progression
      timer1 = setTimeout(() => setConversionStep(1), 1200); // 1.2s: Ingest complete -> LLM
      timer2 = setTimeout(() => setConversionStep(2), 6000); // 6s: LLM likely done -> Validation
    } else {
      setConversionStep(0);
    }
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isConverting]);

  const handleCreateDocSubmit = async () => {
    if (!newDocName.trim() || !newDocHtml.trim()) return;
    setNewDocError("");
    let targetHtml = newDocHtml;
    let createdSemanticArtifact: SemanticArtifact | undefined;
    let createdVisualPlan: VisualPlan | undefined;
    try {
      if (createHtmlOption === "refine") {
        setNewDocError("Refining document with AI... please wait.");
        const convertRes = await fetch("/api/collab/convert", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            gdocHtml: newDocHtml,
          }),
        });
        const convertData = await convertRes.json();
        if (!convertRes.ok || !convertData.success) {
          setNewDocError(convertData.error || "Failed to refine HTML with AI.");
          return;
        }
        targetHtml = convertData.html;
        createdSemanticArtifact = convertData.semanticArtifact;
        createdVisualPlan = convertData.visualPlan;
        setNewDocError("");
      }

      const res = await fetch("/api/collab/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newDocName,
          html: targetHtml,
          workspaceId: activeWorkspaceId,
          ...(createdSemanticArtifact ? { semanticArtifact: createdSemanticArtifact } : {}),
          ...(createdVisualPlan ? { visualPlan: createdVisualPlan } : {})
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNewDocName("");
        setNewDocHtml("");
        setCreateHtmlOption("asis");
        setIsCreateDocModalOpen(false);
        if (activeWorkspaceId) await fetchDocuments(activeWorkspaceId);
        setActiveDocumentId(data.document.id);
      } else {
        setNewDocError(data.error || "Failed to create document.");
      }
    } catch (err: any) {
      setNewDocError(err.message || "An error occurred during document creation.");
    }
  };

  const handleConvertSubmit = async () => {
    setIsConverting(true);
    setConversionStep(0);
    setConvertError("");
    try {
      let returnedHtml = "";
      let defaultDocName = "";
      // ROOM-002/003 wiring: forward whatever the convert route attached
      // (semantic extraction fails independently of HTML conversion — brief
      // §3.3 — so these stay undefined for the "as is" paths and for any doc
      // where semantic extraction itself failed server-side).
      let returnedSemanticArtifact: SemanticArtifact | undefined;
      let returnedVisualPlan: VisualPlan | undefined;

      const isHtmlFile = docxFile && (docxFile.name.toLowerCase().endsWith(".html") || docxFile.name.toLowerCase().endsWith(".htm"));

      if (convertOption === "docx") {
        if (!docxFile) {
          setConvertError("Please select a file.");
          setIsConverting(false);
          return;
        }

        defaultDocName = docxFile.name.replace(/\.(docx|md|html|htm)$/i, "");

        if (isHtmlFile && convertHtmlOption === "asis") {
          // Read HTML directly on client
          returnedHtml = await docxFile.text();
        } else {
          // Standard LLM conversion
          const formData = new FormData();
          formData.append("file", docxFile);
          const response = await fetch("/api/collab/convert", {
            method: "POST",
            body: formData,
          });
          const result = await response.json();
          if (!response.ok || !result.success) {
            setConvertError(result.error || "Failed to convert document.");
            setIsConverting(false);
            return;
          }
          returnedHtml = result.html;
          returnedSemanticArtifact = result.semanticArtifact;
          returnedVisualPlan = result.visualPlan;
        }
      } else {
        if (!pasteHtml.trim()) {
          setConvertError("Please paste the Google Docs HTML content.");
          setIsConverting(false);
          return;
        }

        defaultDocName = `Pasted Doc (${new Date().toLocaleDateString()})`;

        if (convertHtmlOption === "asis") {
          returnedHtml = pasteHtml;
        } else {
          const response = await fetch("/api/collab/convert", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              gdocHtml: pasteHtml,
            }),
          });
          const result = await response.json();
          if (!response.ok || !result.success) {
            setConvertError(result.error || "Failed to convert document.");
            setIsConverting(false);
            return;
          }
          returnedHtml = result.html;
          returnedSemanticArtifact = result.semanticArtifact;
          returnedVisualPlan = result.visualPlan;
        }
      }

      // Determine a document name/title
      let docName = "";
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = returnedHtml;
      const h1 = tempDiv.querySelector("h1");
      if (h1 && h1.textContent?.trim()) {
        docName = h1.textContent.trim();
      } else {
        docName = defaultDocName;
      }

      // Post to the documents API to create a new document in the catalog
      const createRes = await fetch("/api/collab/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: docName,
          html: returnedHtml,
          workspaceId: activeWorkspaceId,
          ...(returnedSemanticArtifact ? { semanticArtifact: returnedSemanticArtifact } : {}),
          ...(returnedVisualPlan ? { visualPlan: returnedVisualPlan } : {})
        }),
      });

      const createData = await createRes.json();
      if (createRes.ok && createData.success) {
        // Clear forms and close modal
        setDocxFile(null);
        setPasteHtml("");
        setConvertError("");
        setConvertHtmlOption("refine");
        setIsConvertModalOpen(false);

        // Refetch document list and switch to the new document
        if (activeWorkspaceId) await fetchDocuments(activeWorkspaceId);
        setActiveDocumentId(createData.document.id);
      } else {
        setConvertError(createData.error || "Failed to save the converted document.");
      }
    } catch (e: any) {
      console.error("Conversion error", e);
      setConvertError(e.message || "An error occurred during conversion.");
    } finally {
      setIsConverting(false);
    }
  };

  /**
   * The only room mutation path.  It intentionally never carries a room
   * collection from the browser; the server derives all IDs, authorship,
   * history and timestamps, then returns the replacement projection.
   */
  const runRoomCommand = async (command: string, input: Record<string, unknown>) => {
    if (roomRevision === null) {
      setRoomError("This room has not loaded yet. Please try again.");
      return null;
    }
    try {
      const response = await fetch("/api/collab/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: activeDocumentId, command, expectedRevision: roomRevision, ...input }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        clearRoomState();
        setRoomError("You no longer have access to this room.");
        return null;
      }
      if (response.status === 409 && payload && typeof payload === "object" && (payload as { code?: unknown }).code === "revision_conflict") {
        // Do not overwrite another member's work. Refresh the authoritative
        // state; the user can retry their narrow action against that revision.
        if (activeDocumentId) await loadDocumentState(activeDocumentId);
        setRoomError("This room changed. It was refreshed; please retry your action.");
        return null;
      }
      if (!response.ok || !payload || typeof payload !== "object") {
        const message = payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : "Unable to save that change.";
        setRoomError(message);
        return null;
      }
      const state = (payload as { state?: unknown }).state;
      if (!state || typeof state !== "object" || (state as { schemaVersion?: unknown }).schemaVersion !== 2) {
        setRoomError("The server did not return an updated room.");
        return null;
      }
      applyRoomState(state as DocumentStateV2);
      return payload as { state: DocumentStateV2; value?: unknown; revision: number };
    } catch (error) {
      console.error("Failed to run room command", error);
      setRoomError("Unable to save that change.");
      return null;
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Poll state from server.
  //
  // Critical: the poll must NOT clobber in-progress UI. It (a) skips entirely
  // while the comment composer or AI sandbox is open, (b) only setState when the
  // server payload meaningfully differs (volatile fields stripped), and (c)
  // never touches selection / scroll / <details> open-state (those live in the
  // DOM / DocumentSurface, not in the polled state).
  //
  // Latest mutable values are read through a ref so the interval doesn't need to
  // be torn down and recreated on every state change (which previously caused a
  // near-constant re-subscribe + re-render storm).
  const pollSnapshotRef = useRef({ roomRevision });
  useEffect(() => {
    pollSnapshotRef.current = { roomRevision };
  }, [roomRevision]);

  const pollPausedRef = useRef(false);
  useEffect(() => {
    pollPausedRef.current = !!sandboxSectionId || isAddingComment;
  }, [sandboxSectionId, isAddingComment]);

  useEffect(() => {
    if (!mounted || !accountId || !activeDocumentId) return;

    let isSubscribed = true;
    const interval = setInterval(() => {
      // Don't pull server state out from under an open composer / sandbox.
      if (pollPausedRef.current) return;

      fetch(`/api/collab?documentId=${activeDocumentId}`)
        .then(async (res) => ({ res, data: await res.json() as unknown }))
        .then(({ res, data }) => {
          if (!isSubscribed || pollPausedRef.current) return;
          if (res.status === 401 || res.status === 403) {
            clearRoomState();
            setRoomError("You no longer have access to this room.");
            return;
          }
          if (!res.ok || !data || typeof data !== "object" || (data as { schemaVersion?: unknown }).schemaVersion !== 2) return;
          const next = data as DocumentStateV2;
          if (next.revision !== pollSnapshotRef.current.roomRevision) applyRoomState(next);
        })
        .catch((err) => {
          console.error("Error polling state from server", err);
        });
    }, 3000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [mounted, accountId, activeDocumentId, applyRoomState, clearRoomState]);

  const handleLogout = () => {
    signOut({ redirect: false });
  };

  // Selecting a document from WorkspaceNav also closes the mobile/overlay nav
  // drawer (same behavior as the pre-decomposition inline onClick).
  const handleSelectDocument = (docId: string) => {
    setActiveDocumentId(docId);
    setIsSidebarOpen(false);
  };

  const handleRestartTour = () => {
    startTour();
    setIsSidebarOpen(true);
    localStorage.removeItem("onboarding_tour_completed");
  };


  // Document version changes
  const currentVersion = documentVersions.find(v => v.versionNumber === activeVersionNum)
    || documentVersions[documentVersions.length - 1]
    || { versionNumber: 0, html: "", status: "Draft" as const, timestamp: new Date(0).toISOString() };

  // Dynamic section and header parsing using DOMParser on client
  const sectionsMetadata = React.useMemo(() => {
    if (typeof window === "undefined" || !mounted) return [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(currentVersion.html, "text/html");
      const elementsWithId = doc.querySelectorAll("[id]");
      const metadata: { id: string; title: string }[] = [];
      elementsWithId.forEach((el) => {
        const id = el.getAttribute("id");
        if (id && id !== "top") {
          let title = id;
          const tagName = el.tagName.toUpperCase();
          if (
            (tagName.startsWith("H") && tagName.length === 2 && !isNaN(Number(tagName[1]))) || 
            el.classList.contains("vcd-section-title") || 
            el.classList.contains("headline")
          ) {
            const text = el.textContent?.trim();
            if (text) title = text;
          } else {
            const header = el.querySelector("summary, h1, h2, h3, h4, h5, h6, .vcd-section-title, .headline, .label");
            if (header) {
              const text = header.textContent?.trim();
              if (text) {
                title = text.replace(/^[▶▼\s]+/, "");
              }
            }
          }
          if (title === id) {
            title = id
              .replace(/[-_]+/g, " ")
              .replace(/\b\w/g, (char) => char.toUpperCase());
          }
          metadata.push({ id, title });
        }
      });
      return metadata;
    } catch (e) {
      console.error("Failed to parse sections metadata", e);
      return [];
    }
  }, [currentVersion.html, mounted]);

  const sectionIds = React.useMemo(() => {
    return sectionsMetadata.map(m => m.id);
  }, [sectionsMetadata]);

  // Text-selection comment: DocumentSurface computes a cross-node-safe
  // {quote, prefix, suffix} from the Range and hands it back here. We open the
  // composer pre-filled. (Hover, highlighting, and selection geometry all live
  // inside DocumentSurface now — no per-mousemove React state in the parent.)
  const handleCommentSelection = React.useCallback((sel: PendingSelection) => {
    if (!currentUser || !hasCapability("comment.create")) return;
    setPendingSemanticAnchor(null);
    setSelectedText(sel.quote);
    setSelectedRange({ quote: sel.quote, prefix: sel.prefix, suffix: sel.suffix });
    setCommentTargetSection(sel.sectionId);
    setIsAddingComment(true);
    setIsCommentsOpen(true);
  }, [currentUser, hasCapability]);

  // Whole-section comment via the hover toolbar button.
  const handleCommentSection = React.useCallback((sectionId: string) => {
    setPendingSemanticAnchor(null);
    setSelectedText("");
    setSelectedRange(null);
    setCommentTargetSection(sectionId);
    setIsAddingComment(true);
    setIsCommentsOpen(true);
  }, []);

  // Canvas-node click comment (COLLAB-002/004): useCommentLinks' onStartComment
  // fires this when a decision-room node has no existing comment yet.
  const handleStartSemanticComment = React.useCallback(
    (gesture: NonNullable<CommentGesture["semantic"]>) => {
      if (!currentUser || !hasCapability("comment.create")) return;
      setSelectedText("");
      setSelectedRange(null);
      setCommentTargetSection("");
      setPendingSemanticAnchor(gesture);
      setIsAddingComment(true);
      setIsCommentsOpen(true);
    },
    [currentUser, hasCapability]
  );

  // Add Comment Submission
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !currentUser) return;

    // COLLAB-002: the gesture that opened the composer decides the anchor
    // type (semantic > text > section precedence) via the pure builder.
    const target = buildCommentTarget({
      semantic: pendingSemanticAnchor ?? undefined,
      text: selectedRange ?? undefined,
      section: commentTargetSection ? { id: commentTargetSection } : undefined,
    });

    const result = await runRoomCommand("createComment", {
      body: commentText,
      target,
      feedbackType: commentFeedbackType,
    });
    if (!result) return;

    // Clear forms
    setCommentText("");
    setIsAddingComment(false);
    setSelectedText("");
    setSelectedRange(null);
    setPendingSemanticAnchor(null);
    // Switch to threads tab to show it
    setActiveTab("threads");
    const created = result.value as Comment | undefined;
    setSelectedCommentId(created?.id ?? null);
  };

  // Add Reply Submission
  const handleAddReply = async (e: React.FormEvent, commentId: string) => {
    e.preventDefault();
    const draft = (replyDrafts[commentId] || "").trim();
    if (!draft || !currentUser) return;
    const result = await runRoomCommand("replyToComment", { threadId: commentId, body: draft });
    if (!result) return;
    setReplyDrafts(prev => ({ ...prev, [commentId]: "" }));
  };

  // Resolve Comment
  // Phase 7 (§7 "Resolved with change in vN"): records the HTML version
  // active at resolution + (for semantic targets) the anchored node id, and
  // reflects it in the history event text — kept behavior-parallel with the
  // app's resolveComment(id, changeLink?, versionNumber?) (this is the LIVE
  // path; DecisionRoomApp's handler is hand-rolled, not a call to that fn —
  // see brief §1 "Surprise / constraint worth flagging").
  const handleResolveComment = async (commentId: string) => {
    const comment = comments.find((item) => item.id === commentId);
    if (!comment) return;
    await runRoomCommand(comment.lifecycle === "open" ? "resolveComment" : "reopenComment", { threadId: commentId });
  };
  const canResolveComment = React.useCallback((comment: Comment) => Boolean(
    currentUser
    && hasCapability("comment.resolve")
    && (hasCapability("room.edit") || comment.author === currentUser.accountId)
  ), [currentUser, hasCapability]);

  // AI Surgical Edit Simulation
  const handleOpenAiEdit = (sectionId: string) => {
    setSandboxSectionId(sectionId);
    setSandboxPrompt("");
    setSandboxSimulatedHtml(null);
    setSandboxDiffHtml(null);
    setSandboxIsSimulated(false);
    setSandboxError("");
  };

  const PRESETS = [
    { label: "Executive Polish", prompt: "Rewrite this section to make it sound highly professional, polished, and ready for an executive presentation." },
    { label: "Make Concise", prompt: "Condense this section to make it extremely clear, short, and punchy, removing any filler words." },
    { label: "Detail Metrics & Targets", prompt: "Add detailed targets for active daily users (target 10,000) and claim processing times (target under 2 hours)." },
    { label: "Add HIPAA / Compliance Details", prompt: "Add details about data encryption, secure audit trails, and HIPAA compliance requirements." }
  ];

  const handleSimulateAiEdit = async () => {
    if (!sandboxSectionId) return;
    setSandboxLoading(true);
    setSandboxError("");

    // Fetch existing section content from the active version.
    const parser = new DOMParser();
    const doc = parser.parseFromString(currentVersion.html, "text/html");
    const sectionEl = doc.getElementById(sandboxSectionId);
    const oldSectionHtml = sectionEl ? sectionEl.outerHTML : "";

    try {
      const res = await fetch("/api/collab/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: activeDocumentId,
          sectionId: sandboxSectionId,
          sectionHtml: oldSectionHtml,
          instruction: sandboxPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || typeof data.html !== "string") {
        setSandboxError(data.error || "AI edit failed.");
        setSandboxLoading(false);
        return;
      }

      let newSectionHtml = data.html;
      if (data.simulated) {
        if (sandboxSectionId === "background") {
          newSectionHtml = newSectionHtml
            .replace(/analytics/g, "advanced analytics")
            .replace(/redundancy/g, "inefficiency");
        } else {
          newSectionHtml = newSectionHtml
            .replace(/Vendor/g, "Provider")
            .replace(/vendor/g, "provider");
        }
      }
      setSandboxSimulatedHtml(newSectionHtml);
      setSandboxIsSimulated(!!data.simulated);

      // Compute inline diff preview using diff-match-patch.
      const dmp = new diff_match_patch();
      const diffs = dmp.diff_main(oldSectionHtml, newSectionHtml);
      dmp.diff_cleanupSemantic(diffs);

      let diffMarkup = "";
      for (const [op, text] of diffs) {
        const escaped = text.replace(/[&<>"]/g, m => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "\"": "&quot;",
          "'": "&#39;"
        }[m] || m));
        if (op === 0) {
          diffMarkup += escaped;
        } else if (op === 1) {
          diffMarkup += `<ins class="bg-green-100 text-green-800 no-underline px-1 rounded font-medium">${escaped}</ins>`;
        } else if (op === -1) {
          diffMarkup += `<del class="bg-red-100 text-red-800 line-through px-1 rounded">${escaped}</del>`;
        }
      }
      setSandboxDiffHtml(diffMarkup);
    } catch (err: any) {
      setSandboxError(err?.message || "Network error during AI edit.");
    } finally {
      setSandboxLoading(false);
    }
  };

  const handleCommitAiEdit = async () => {
    if (!sandboxSectionId || !sandboxSimulatedHtml || !currentUser) return;

    // Replace the section HTML in the main document
    const parser = new DOMParser();
    const doc = parser.parseFromString(currentVersion.html, "text/html");
    const targetEl = doc.getElementById(sandboxSectionId);
    if (targetEl) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = sandboxSimulatedHtml;
      const newEl = tempDiv.firstElementChild;
      if (newEl) {
        targetEl.replaceWith(newEl);
      }
    }

    const updatedHtml = doc.body.innerHTML;
    // The command service creates the immutable version and derives all
    // lifecycle/history state. The browser never re-anchors or writes a
    // comment collection itself.
    const result = await runRoomCommand("createVersion", { html: updatedHtml });
    if (result) setSandboxSectionId(null);
  };

  // Document Verdict Change
  const handleToggleSectionLock = async (sectionId: string) => {
    // Source locking is document-version scoped in Phase 9. `sectionId` is a
    // legacy toolbar argument and intentionally is not sent to the server.
    void sectionId;
    const currentlyLocked = lockedSections.includes("__source_locked__");
    await runRoomCommand("lockSource", { locked: !currentlyLocked });
  };

  const handleVerdictChange = async (val: "approve" | "changes" | "block" | null) => {
    if (!currentUser || !hasCapability("verdict.set_self")) return;
    await runRoomCommand("setOwnVerdict", { verdict: val });
  };

  // Promoting version to Live status
  const handlePromoteToLive = async () => {
    await runRoomCommand("publishVersion", { versionNumber: activeVersionNum });
  };

  // Creating new draft from Live
  const handleCreateNewDraft = async () => {
    await runRoomCommand("createVersion", { html: currentVersion.html });
  };

  const [isRegenerating, setIsRegenerating] = useState(false);
  const handleRegenerateDraft = async () => {
    if (currentVersion.status !== "Draft") return;
    setIsRegenerating(true);
    try {
      const res = await fetch("/api/collab/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: activeDocumentId,
          lockedIds: lockedSections,
          expectedRevision: roomRevision,
        })
      });
      const data = await res.json();
      if (data.success && typeof data.html === "string") {
        await runRoomCommand("regenerateVersion", { generatedHtml: data.html });
      } else {
        alert("Failed to regenerate: " + data.error);
      }
    } catch (err) {
      console.error("Failed to regenerate draft", err);
    } finally {
      setIsRegenerating(false);
    }
  };

  // Sidebar List Calculations
  // Parse Action Items: feedback is 'flag' or 'needs'
  const actionItems = comments.filter(c => c.feedbackType === "flag" || c.feedbackType === "needs");
  
  // Parse Decisions: feedback is 'approve'
  const decisions = comments.filter(c => c.feedbackType === "approve");

  // Helper to extract mentions from comment body/replies
  const getAssignees = (comment: Comment): string[] => {
    const list = new Set<string>();
    
    // Parse from body
    const regex = /@(\w+)/g;
    let match;
    while ((match = regex.exec(comment.body)) !== null) {
      if (match[1]) list.add(match[1].toUpperCase());
    }

    // Parse from replies
    comment.replies.forEach((r: any) => {
      let rMatch;
      const rBody = r.body;
      while ((rMatch = regex.exec(rBody)) !== null) {
        if (rMatch[1]) list.add(rMatch[1].toUpperCase());
      }
    });

    return Array.from(list);
  };

  // Comment highlighting (CSS Custom Highlight API), in-page anchor scrolling,
  // and highlight hit-testing all live in DocumentSurface now. When a
  // highlighted range / element is clicked, DocumentSurface calls this to focus
  // the matching thread in the sidebar.
  const handleSelectComment = React.useCallback((commentId: string) => {
    setSelectedCommentId(commentId);
    setActiveTab("threads");
    const element = document.getElementById(`sidebar-comment-${commentId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, []);

  // COLLAB-004: delegated hover/click linking (canvas node <-> rail card) +
  // per-node OPEN-comment-count badge stamping. Pure DOM side effects, off
  // the React render path (brief §6.2) — see useCommentLinks.ts.
  useCommentLinks({
    rootRef: roomRootRef,
    // The layout (and thus roomRootRef.current) exists only past the mounted +
    // auth gates below; the hook's binding effects re-run when this flips
    // (Opus review B1 — a bare ref object never re-triggers an effect).
    enabled: mounted && !!accountId && !!currentUser && hasCapability("room.read"),
    comments,
    artifact: semanticArtifact,
    onSelectComment: handleSelectComment,
    onStartComment: handleStartSemanticComment,
  });

  // If not hydrated yet
  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-600 font-medium font-sans">Initializing Workspace...</p>
        </div>
      </div>
    );
  }  // 1. Auth Lock Screen
  if (!accountId || !currentUser) {
    return (
      <AuthScreen />
    );
  }

  // 2. Collaborative Review Dashboard
  // ROOM-002/003/004: the inline three-pane JSX + the old "Alignment Sign-off
  // Verdicts" banner are REPLACED by a DecisionRoomLayout composition (brief
  // §7.2). This is decomposition, not redesign — every handler/prop below is
  // unchanged from the pre-decomposition version; only the JSX shell moved
  // into presentational sub-components.

  const selectedDocumentId = activeDocumentId ?? "";
  const legacyDocumentSurface = (
    <div ref={previewContainerRef} className="pane-preview-body">
      {currentVersion.html.includes("id=") ? (
        <DocumentSurface
          docId={selectedDocumentId}
          versionNumber={activeVersionNum}
          html={currentVersion.html}
          isDraft={currentVersion.status === "Draft"}
          comments={comments}
          sectionsMetadata={sectionsMetadata}
          sectionIds={sectionIds}
          selectedCommentId={selectedCommentId}
          canEdit={hasCapability("room.edit")}
          canComment={hasCapability("comment.create")}
          previewContainerRef={previewContainerRef}
          onSelectComment={handleSelectComment}
          onOpenAiEdit={handleOpenAiEdit}
          onCommentSection={handleCommentSection}
          onCommentSelection={handleCommentSelection}
          lockedSections={lockedSections}
          onToggleLock={handleToggleSectionLock}
        />
      ) : (
        <div className="text-slate-500 text-sm">Document HTML format incorrect.</div>
      )}
    </div>
  );

  // Small canvas-frame topline (filename, Draft/Live badge, "Create New
  // Draft") — unchanged behavior from the pre-decomposition "Document Content
  // Box" header, just restyled with the --dr-* tokens.
  const canvasTopline = (
    <div className="dr-canvas-topline">
      <div className="dr-canvas-topline-left">
        <FileText className="dr-canvas-topline-icon" />
        <span className="dr-canvas-topline-name">
          {documents.find((d) => d.id === activeDocumentId)?.title || "Document Preview"}
        </span>
        <span
          className={`dr-canvas-status-badge ${
            currentVersion.status === "Live" ? "dr-canvas-status-live" : "dr-canvas-status-draft"
          }`}
        >
          {currentVersion.status}
        </span>
      </div>

      {hasCapability("version.create") && currentVersion.status !== "Draft" && (
        <button onClick={handleCreateNewDraft} className="dr-canvas-topline-btn">
          Create New Draft
        </button>
      )}
      {semanticArtifact && hasCapability("agent.export") && roomRevision !== null && (
        <DecisionRoomExportButton
          documentId={selectedDocumentId}
          expectedRevision={roomRevision}
          onState={applyRoomState}
          onRevision={setRoomRevision}
          onAccessLost={() => { clearRoomState(); setRoomError("You no longer have access to this room."); }}
        />
      )}
    </div>
  );

  // Router: semanticArtifact present -> decision room (VisualTabs); absent ->
  // legacy DocumentSurface is the whole canvas (brief §7.2 "Legacy remains
  // reachable"). EmptyState wins over both when the active workspace has zero
  // documents.
  const workspaceHasNoDocuments =
    Boolean(activeWorkspaceId) && documentsLoaded && documents.length === 0;

  const canvasContent = workspaceHasNoDocuments ? (
    <EmptyState onImport={() => setIsConvertModalOpen(true)} />
  ) : (
    <div className="dr-canvas-frame">
      {canvasTopline}
      {semanticArtifact && effectivePlan ? (
        <VisualTabs key={semanticArtifact.id} artifact={semanticArtifact} plan={effectivePlan} sourceContent={legacyDocumentSurface} />
      ) : (
        legacyDocumentSurface
      )}
    </div>
  );

  const topBarContent = (
    <>
      <Header
        setIsSidebarOpen={setIsSidebarOpen}
        documents={documents}
        activeDocumentId={activeDocumentId}
        documentVersions={documentVersions}
        activeVersionNum={activeVersionNum}
        setActiveVersionNum={setActiveVersionNum}
        currentUser={activeDocumentUser}
        setIsConvertModalOpen={setIsConvertModalOpen}
        isCommentsOpen={isCommentsOpen}
        setIsCommentsOpen={setIsCommentsOpen}
        handleLogout={handleLogout}
        activeWorkspaceId={activeWorkspaceId}
        isSemanticRoom={Boolean(semanticArtifact)}
        roomRevision={roomRevision}
        onRoomState={applyRoomState}
        onAccessLost={() => { clearRoomState(); setRoomError("You no longer have access to this room."); }}
      />
      <TopDecisionBar
        title={semanticArtifact ? semanticArtifact.title : (documents.find((d) => d.id === activeDocumentId)?.title || "Document Preview")}
        bluf={semanticArtifact?.bluf}
        verdicts={verdicts}
        currentUserName={currentUser.name}
        onVerdictChange={handleVerdictChange}
        canSetVerdict={hasCapability("verdict.set_self")}
      />
    </>
  );

  const navContent = (
    <WorkspaceNav
      activeWorkspaceId={activeWorkspaceId}
      onSelectWorkspace={setActiveWorkspaceId}
      onOpenWorkspaceSettings={() => setIsWorkspaceSettingsOpen(true)}
      searchTerm={searchTerm}
      onSearchTermChange={setSearchTerm}
      documents={documents}
      activeDocumentId={activeDocumentId}
      onSelectDocument={handleSelectDocument}
      canCreateDoc={canCreateDocInWorkspace}
      onOpenConvertModal={() => setIsConvertModalOpen(true)}
      currentUser={activeDocumentUser}
      onLogout={handleLogout}
      onRestartTour={handleRestartTour}
    />
  );

  // Router (brief §4 ARCH DECISION): the redesigned rail is decision-room-only
  // — legacy docs (no semanticArtifact) keep the untouched dark CommentSidebar.
  const reviewRailContent = isCommentsOpen ? (
    semanticArtifact ? (
      <ReviewRail
        documentId={selectedDocumentId}
        tourStep={tourStep}
        isAddingComment={isAddingComment}
        setIsAddingComment={setIsAddingComment}
        selectedText={selectedText}
        pendingSemanticAnchor={pendingSemanticAnchor}
        handleAddComment={handleAddComment}
        commentText={commentText}
        setCommentText={setCommentText}
        commentFeedbackType={commentFeedbackType}
        setCommentFeedbackType={setCommentFeedbackType}
        comments={comments}
        selectedCommentId={selectedCommentId}
        setSelectedCommentId={setSelectedCommentId}
        replyDrafts={replyDrafts}
        setReplyDrafts={setReplyDrafts}
        handleAddReply={handleAddReply}
        currentUser={activeDocumentUser}
        handleResolveComment={handleResolveComment}
        canResolveComment={canResolveComment}
        artifact={semanticArtifact}
        roomRevision={roomRevision}
        onRoomState={applyRoomState}
        onRoomRevision={setRoomRevision}
        onAccessLost={() => { clearRoomState(); setRoomError("You no longer have access to this room."); }}
      />
    ) : (
      <CommentSidebar
        tourStep={tourStep}
        isAddingComment={isAddingComment}
        setIsAddingComment={setIsAddingComment}
        selectedText={selectedText}
        handleAddComment={handleAddComment}
        commentText={commentText}
        setCommentText={setCommentText}
        commentFeedbackType={commentFeedbackType}
        setCommentFeedbackType={setCommentFeedbackType}
        comments={comments}
        selectedCommentId={selectedCommentId}
        setSelectedCommentId={setSelectedCommentId}
        replyDrafts={replyDrafts}
        setReplyDrafts={setReplyDrafts}
        handleAddReply={handleAddReply}
        currentUser={activeDocumentUser}
        handleResolveComment={handleResolveComment}
        canResolveComment={canResolveComment}
      />
    )
  ) : null;

  return (
    <>
      <DecisionRoomLayout
        topBar={topBarContent}
        nav={navContent}
        canvas={canvasContent}
        reviewRail={reviewRailContent}
        isCommentsOpen={isCommentsOpen}
        isSidebarOpen={isSidebarOpen}
        onCloseSidebar={() => setIsSidebarOpen(false)}
        tourNavActive={tourStep === 0}
        tourCanvasActive={tourStep === 1}
        rootRef={roomRootRef}
      />

      <WorkspaceSettingsModal
        isOpen={isWorkspaceSettingsOpen}
        onClose={() => setIsWorkspaceSettingsOpen(false)}
        workspaceId={activeWorkspaceId}
      />

      {/* AI Surgical Sandbox Modal */}
      {sandboxSectionId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                <h3 className="text-md font-bold text-slate-900 font-display">AI Surgical Edit Sandbox</h3>
              </div>
              <button 
                onClick={() => setSandboxSectionId(null)}
                data-testid="ai-discard-button"
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1 font-sans">
              
              {/* Presets */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-display">Prompt Presets</span>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSandboxPrompt(p.prompt)}
                      data-testid={`ai-preset-${idx}`}
                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold px-3 py-1.5 rounded-xl border border-indigo-100/50 transition-all text-left cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Prompt */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-display">Custom AI Directives</label>
                <textarea
                  data-testid="ai-prompt-input"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none placeholder-slate-400 font-sans"
                  placeholder="Tell the AI what changes to make (e.g. make it short, rewrite with formal vocabulary...)"
                  rows={3}
                  value={sandboxPrompt}
                  onChange={(e) => setSandboxPrompt(e.target.value)}
                />
              </div>

              {/* Action Trigger */}
              <div className="flex justify-end">
                <button
                  onClick={handleSimulateAiEdit}
                  disabled={!sandboxPrompt.trim() || sandboxLoading}
                  data-testid="ai-submit-button"
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold py-2 px-5 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-100 cursor-pointer"
                >
                  {sandboxLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Executing edit...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Generate AI Edit
                    </>
                  )}
                </button>
              </div>

              {/* Error */}
              {sandboxError && (
                <div data-testid="sandbox-error-message" className="bg-red-50 text-red-700 text-xs px-4 py-3 rounded-xl border border-red-100 flex items-start gap-2 animate-fade-in">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{sandboxError}</span>
                </div>
              )}

              {/* Diff Preview */}
              {sandboxDiffHtml && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-display">Unified Inline Diff Preview</span>
                    {sandboxIsSimulated && (
                      <span
                        data-testid="ai-simulated-badge"
                        className="text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full"
                        title="No LLM API key configured — this edit is a deterministic simulation."
                      >
                        Simulated (no API key)
                      </span>
                    )}
                  </div>
                  <div
                    data-testid="diff-preview"
                    className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs leading-relaxed font-sans overflow-x-auto max-h-40"
                    dangerouslySetInnerHTML={{ __html: sandboxDiffHtml }}
                  />
                </div>
              )}
            </div>

            {/* Modal Actions */}
            {sandboxSimulatedHtml && (
              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-between gap-3">
                <button
                  onClick={() => setSandboxSectionId(null)}
                  className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Discard Changes
                </button>
                <button
                  onClick={handleCommitAiEdit}
                  data-testid="ai-commit-button"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-5 rounded-xl text-xs flex items-center gap-1 transition-colors shadow-sm cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  Commit to v{documentVersions.length + 1}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Convert New Document Modal */}
      {isConvertModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel bg-white/95 rounded-3xl shadow-2xl border border-white/40 w-full max-w-lg overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                <h3 className="text-md font-bold text-slate-900 font-display">Convert New Document</h3>
              </div>
              <button 
                onClick={() => {
                  setIsConvertModalOpen(false);
                  setConvertError("");
                  setDocxFile(null);
                  setPasteHtml("");
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 font-sans">
              {convertError && (
                <div className="bg-red-50 text-red-700 text-xs px-4 py-3 rounded-xl border border-red-100 flex items-start gap-2 animate-fade-in">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{convertError}</span>
                </div>
              )}

              {/* Option Tabs */}
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setConvertOption("docx")}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    convertOption === "docx"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Upload File (.docx, .md, .html, .htm)
                </button>
                <button
                  type="button"
                  onClick={() => setConvertOption("paste")}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    convertOption === "paste"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Paste HTML / Google Docs
                </button>
              </div>

              {/* Option A: Docx/HTML/MD File Upload */}
              {convertOption === "docx" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-display">
                      Select Document (.docx, .md, .html, .htm)
                    </label>
                    <div className="flex items-center justify-center w-full">
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-200 border-dashed rounded-2xl cursor-pointer bg-slate-50 hover:bg-slate-100/50 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <FileText className="h-8 w-8 text-slate-400 mb-2" />
                          <p className="text-xs text-slate-600 font-semibold mb-1">
                            {docxFile ? docxFile.name : "Click to select a file"}
                          </p>
                          <p className="text-[10px] text-slate-400">Word, Markdown, or HTML files</p>
                        </div>
                        <input
                          type="file"
                          accept=".docx,.md,.html,.htm"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              setDocxFile(e.target.files[0]);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {docxFile && (docxFile.name.toLowerCase().endsWith(".html") || docxFile.name.toLowerCase().endsWith(".htm")) && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-2 animate-fade-in">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-display">
                        HTML Processing Option
                      </label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="radio"
                            name="convert-file-html-option"
                            value="asis"
                            checked={convertHtmlOption === "asis"}
                            onChange={() => setConvertHtmlOption("asis")}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          Use HTML as is
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="radio"
                            name="convert-file-html-option"
                            value="refine"
                            checked={convertHtmlOption === "refine"}
                            onChange={() => setConvertHtmlOption("refine")}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          Refine with AI
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Option B: Raw HTML Paste */}
              {convertOption === "paste" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-display">
                      Google Docs Raw HTML
                    </label>
                    <textarea
                      data-testid="convert-paste-textarea"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none placeholder-slate-400 font-mono"
                      placeholder="Paste <html>...</html> or <div>...</div> code from Google Docs here..."
                      rows={8}
                      value={pasteHtml}
                      onChange={(e) => setPasteHtml(e.target.value)}
                    />
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-display">
                      HTML Processing Option
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="convert-paste-html-option"
                          value="asis"
                          checked={convertHtmlOption === "asis"}
                          onChange={() => setConvertHtmlOption("asis")}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        Use HTML as is
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="convert-paste-html-option"
                          value="refine"
                          checked={convertHtmlOption === "refine"}
                          onChange={() => setConvertHtmlOption("refine")}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        Refine with AI
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsConvertModalOpen(false);
                  setConvertError("");
                  setDocxFile(null);
                  setPasteHtml("");
                }}
                disabled={isConverting}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConvertSubmit}
                data-testid="convert-submit-btn"
                disabled={isConverting || (convertOption === "docx" ? !docxFile : !pasteHtml.trim())}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold py-2 px-5 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-100 cursor-pointer"
              >
                {isConverting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1"></div>
                    {conversionStep === 0 && "Ingesting document..."}
                    {conversionStep === 1 && "Synthesizing structure via LLM..."}
                    {conversionStep === 2 && "Validating progressive disclosure..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Convert
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create New Document Modal */}
      {isCreateDocModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-600" />
                <h3 className="text-md font-bold text-slate-900 font-display">Create New Document</h3>
              </div>
              <button 
                onClick={() => {
                  setIsCreateDocModalOpen(false);
                  setNewDocName("");
                  setNewDocHtml("");
                  setNewDocError("");
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer animate-none bg-transparent border-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1 font-sans">
              {newDocError && (
                <div className="bg-red-50 text-red-700 text-xs px-4 py-3 rounded-xl border border-red-100 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{newDocError}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-display">
                  Document Name / Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Marketing Launch Plan"
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none placeholder-slate-400 bg-white text-slate-900 font-sans"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-display">
                    Document HTML Content
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewDocHtml(
`<style>
  .vcd-wrap {
    font-family: Georgia, serif;
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
</style>

<div class="vcd-wrap" id="top">
  <div class="vcd-bluf">
    <div class="headline">New Initiative Summary</div>
    <p class="subhead">Describe the key details of the project alignment brief.</p>
  </div>
  
  <div class="vcd-section-title" id="overview">Overview</div>
  <p>Add some context here. Highlight text to comment or hover for surgical AI edit tools.</p>
</div>`
                      );
                    }}
                    className="text-[10px] text-indigo-600 hover:text-indigo-700 font-bold bg-transparent border-0 cursor-pointer"
                  >
                    Insert Boilerplate Template
                  </button>
                </div>
                <textarea
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none placeholder-slate-400 font-mono"
                  placeholder="Paste HTML here or click 'Insert Boilerplate Template'..."
                  rows={8}
                  value={newDocHtml}
                  onChange={(e) => setNewDocHtml(e.target.value)}
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-display">
                  HTML Processing Option
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="create-html-option"
                      value="asis"
                      checked={createHtmlOption === "asis"}
                      onChange={() => setCreateHtmlOption("asis")}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    Use HTML as is
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="create-html-option"
                      value="refine"
                      checked={createHtmlOption === "refine"}
                      onChange={() => setCreateHtmlOption("refine")}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    Refine with AI
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsCreateDocModalOpen(false);
                  setNewDocName("");
                  setNewDocHtml("");
                  setNewDocError("");
                }}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateDocSubmit}
                disabled={!newDocName.trim() || !newDocHtml.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold py-2 px-5 rounded-xl text-xs transition-colors shadow-md shadow-indigo-150 cursor-pointer"
              >
                Create Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Tour Popover */}
      {tourStep !== null && (
        <div
          className={`fixed z-[9999] bottom-6 ${
            tourStep === 3 ? "left-6" : "right-6"
          } max-w-sm w-[360px] bg-slate-900 text-slate-100 border border-slate-800 shadow-2xl rounded-2xl p-5 animate-in fade-in slide-in-from-bottom-5 duration-300 font-sans`}
        >
          <div className="space-y-4">
            {/* Step header */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest font-mono">
                Tour Guide · Step {tourStep + 1} of {TOUR_STEPS.length}
              </span>
              <button
                onClick={() => {
                  setTourStep(null);
                  localStorage.setItem("onboarding_tour_completed", "true");
                }}
                className="text-slate-500 hover:text-slate-300 transition-colors bg-transparent border-0 cursor-pointer"
                title="Skip Tour"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Title & Description */}
            <div className="space-y-1.5">
              <h4 className="text-sm font-bold text-white leading-snug">
                {TOUR_STEPS[tourStep].title}
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                {TOUR_STEPS[tourStep].description}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  setTourStep(null);
                  localStorage.setItem("onboarding_tour_completed", "true");
                }}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors font-medium cursor-pointer bg-transparent border-0"
              >
                Skip Tour
              </button>
              
              <div className="flex items-center gap-2">
                {tourStep > 0 && (
                  <button
                    onClick={() => setTourStep(tourStep - 1)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={() => {
                    if (tourStep < TOUR_STEPS.length - 1) {
                      setTourStep(tourStep + 1);
                    } else {
                      setTourStep(null);
                      localStorage.setItem("onboarding_tour_completed", "true");
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-950 transition-colors cursor-pointer"
                >
                  {tourStep === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
