"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Lock, CheckCircle2, AlertTriangle, HelpCircle, MessageSquare, 
  Sparkles, Check, X, LogOut, ChevronRight, User, ThumbsUp, XOctagon,
  CornerDownRight, Calendar, UserCheck, Plus, Eye, CheckSquare, List, Send, FileText
} from "lucide-react";
import { diff_match_patch } from "diff-match-patch";

import { 
  canView, 
  canComment, 
  canEdit,
  locate,
  type Comment,
  type Reply
} from "htmlcollab-app/collab";

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

// Mock comment builder helper
function createMockComment(
  id: string,
  author: string,
  quote: string,
  body: string,
  sectionId: string,
  feedbackType: "approve" | "flag" | "needs" | "question" | null
): Comment {
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
    description: "Read documents, select text to leave inline comments, and view version histories.",
    position: "bottom"
  },
  {
    targetId: "tour-section-tools",
    title: "Block & AI Sandbox Tools",
    description: "Hover over any document block to highlight it, and click to open the AI Sandbox to rewrite sections.",
    position: "right"
  },
  {
    targetId: "tour-right-collab",
    title: "Collaboration Sidebar",
    description: "Participate in discussions, request changes, track decisions, and vote for document alignment.",
    position: "left"
  }
];

export default function Home() {
  const [mounted, setMounted] = useState(false);

  // Document catalog and onboarding states
  const [documents, setDocuments] = useState<{ id: string; name: string; createdAt: string }[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeDocumentId, setActiveDocumentId] = useState("doc-1");
  const [isCreateDocModalOpen, setIsCreateDocModalOpen] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocHtml, setNewDocHtml] = useState("");
  const [newDocError, setNewDocError] = useState("");
  const [tourStep, setTourStep] = useState<number | null>(null);
  
  // Auth state
  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin");
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [roleInput, setRoleInput] = useState<"owner" | "collaborator" | "commenter" | "viewer">("collaborator");
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ name: string; role: "owner" | "collaborator" | "commenter" | "viewer" } | null>(null);
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
  const [verdicts, setVerdicts] = useState<Record<string, "approve" | "changes" | "block" | null>>({
    "Sam": "approve",
    "Alex": null,
    "Priya": null,
    "Nirat": null
  });

  // Comments, replies, notifications state
  const [comments, setComments] = useState<Comment[]>(SEED_COMMENTS);
  const [activeTab, setActiveTab] = useState<"threads" | "decisions" | "actions">("threads");
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);

  // Comment Form state
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [commentTargetSection, setCommentTargetSection] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentFeedbackType, setCommentFeedbackType] = useState<"approve" | "flag" | "needs" | "question" | null>("question");
  const [selectedText, setSelectedText] = useState("");
  const [selectedRange, setSelectedRange] = useState<{ quote: string; prefix: string; suffix: string } | null>(null);

  // Reply Form state
  const [replyText, setReplyText] = useState("");

  // AI Sandbox state
  const [sandboxSectionId, setSandboxSectionId] = useState<string | null>(null);
  const [sandboxPrompt, setSandboxPrompt] = useState("");
  const [sandboxSimulatedHtml, setSandboxSimulatedHtml] = useState<string | null>(null);
  const [sandboxDiffHtml, setSandboxDiffHtml] = useState<string | null>(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);

  // Document root ref for dynamic location
  const documentRootRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Convert Document Modal states
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [convertOption, setConvertOption] = useState<"docx" | "paste">("docx");
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [pasteHtml, setPasteHtml] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [convertError, setConvertError] = useState("");

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/collab/documents");
      const data = await res.json();
      if (data.success && data.documents) {
        setDocuments(data.documents);
      }
    } catch (e) {
      console.error("Failed to fetch documents", e);
    }
  };

  const loadDocumentState = async (docId: string) => {
    try {
      const res = await fetch(`/api/collab?documentId=${docId}`);
      const data = await res.json();
      if (data.versions) setDocumentVersions(data.versions);
      if (data.activeVersionNum) setActiveVersionNum(data.activeVersionNum);
      if (data.comments) setComments(data.comments);
      if (data.verdicts) setVerdicts(data.verdicts);
      setSandboxSectionId(null);
      setSandboxSimulatedHtml(null);
      setSandboxDiffHtml(null);
    } catch (err) {
      console.error("Failed to load state for document", docId, err);
    }
  };

  const startTour = () => {
    setTourStep(0);
  };

  useEffect(() => {
    if (mounted && authToken && currentUser) {
      const tourCompleted = localStorage.getItem("onboarding_tour_completed");
      if (!tourCompleted) {
        startTour();
      }
    }
  }, [mounted, authToken, currentUser]);

  useEffect(() => {
    if (authToken) {
      fetchDocuments();
    }
  }, [authToken]);

  useEffect(() => {
    if (!mounted || !authToken) return;
    loadDocumentState(activeDocumentId);
  }, [activeDocumentId, mounted, authToken]);

  const handleCreateDocSubmit = async () => {
    if (!newDocName.trim() || !newDocHtml.trim()) return;
    setNewDocError("");
    try {
      const res = await fetch("/api/collab/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newDocName,
          html: newDocHtml
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNewDocName("");
        setNewDocHtml("");
        setIsCreateDocModalOpen(false);
        await fetchDocuments();
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
    setConvertError("");
    try {
      let response;
      if (convertOption === "docx") {
        if (!docxFile) {
          setConvertError("Please select a .docx file.");
          setIsConverting(false);
          return;
        }
        const formData = new FormData();
        formData.append("file", docxFile);
        response = await fetch("/api/collab/convert", {
          method: "POST",
          body: formData,
        });
      } else {
        if (!pasteHtml.trim()) {
          setConvertError("Please paste the Google Docs HTML content.");
          setIsConverting(false);
          return;
        }
        response = await fetch("/api/collab/convert", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            gdocHtml: pasteHtml,
          }),
        });
      }

      const result = await response.json();
      if (response.ok && result.success) {
        const returnedHtml = result.html;
        const nextVersionNum = documentVersions.length + 1;
        const newVersion = {
          versionNumber: nextVersionNum,
          html: returnedHtml,
          status: "Draft" as const,
          timestamp: new Date().toISOString(),
        };
        const newVersions = [...documentVersions, newVersion];

        // Re-anchor active comments using the locate() tool from htmlcollab-app
        const containerDiv = document.createElement("div");
        containerDiv.innerHTML = returnedHtml;

        const updatedComments = comments.map((c) => {
          if (c.lifecycle === "resolved") return c;
          const locateResult = locate(containerDiv, c);

          // Update history record
          const hasReanchored = locateResult.status !== c.anchorStatus;
          const historyUpdate = hasReanchored
            ? [
                {
                  event: `re-anchored to status: ${locateResult.status} due to v${nextVersionNum} upload`,
                  who: "System",
                  when: Date.now(),
                },
              ]
            : [];

          return {
            ...c,
            anchorStatus: locateResult.status,
            posStart: locateResult.status !== "orphaned" ? locateResult.start : undefined,
            posEnd: locateResult.status !== "orphaned" ? locateResult.end : undefined,
            lastKnownContext:
              locateResult.newText || locateResult.newSnippet || c.lastKnownContext,
            history: [...c.history, ...historyUpdate],
          };
        });

        setDocumentVersions(newVersions);
        setComments(updatedComments);
        setActiveVersionNum(nextVersionNum);

        // Clear forms and close modal
        setDocxFile(null);
        setPasteHtml("");
        setConvertError("");
        setIsConvertModalOpen(false);

        // Call syncState to save the newly created version and updated comments to the server database.
        await syncState(newVersions, nextVersionNum, updatedComments, verdicts);
      } else {
        setConvertError(result.error || "Failed to convert document.");
      }
    } catch (e: any) {
      console.error("Conversion error", e);
      setConvertError(e.message || "An error occurred during conversion.");
    } finally {
      setIsConverting(false);
    }
  };

  // Sync state helper
  const syncState = async (
    newVersions: typeof documentVersions,
    newActiveVersionNum: number,
    newComments: typeof comments,
    newVerdicts: typeof verdicts
  ) => {
    try {
      await fetch(`/api/collab?documentId=${activeDocumentId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          versions: newVersions,
          activeVersionNum: newActiveVersionNum,
          comments: newComments,
          verdicts: newVerdicts,
        }),
      });
    } catch (e) {
      console.error("Failed to sync state to server", e);
    }
  };

  useEffect(() => {
    setMounted(true);

    // Initial load from URL query
    const params = new URLSearchParams(window.location.search);
    const queryToken = params.get("token");
    if (queryToken) {
      localStorage.setItem("collab_token", queryToken);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }

    // Load and validate from localStorage
    const savedToken = localStorage.getItem("collab_token");
    if (savedToken) {
      fetch("/api/auth/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: savedToken }),
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error("Invalid token");
          }
          return res.json();
        })
        .then((data) => {
          if (data.success && data.user) {
            const role = data.user.role;
            if (role === "owner" || role === "collaborator" || role === "commenter" || role === "viewer") {
              setAuthToken(savedToken);
              setCurrentUser({ name: data.user.name, role });
            } else {
              throw new Error("Invalid role");
            }
          } else {
            throw new Error("Invalid token validation response");
          }
        })
        .catch(() => {
          localStorage.removeItem("collab_token");
          setAuthToken(null);
          setCurrentUser(null);
        });
    }

  }, []);

  // Poll state from server
  useEffect(() => {
    if (!mounted || !authToken || !activeDocumentId) return;

    let isSubscribed = true;
    const interval = setInterval(() => {
      fetch(`/api/collab?documentId=${activeDocumentId}`)
        .then((res) => res.json())
        .then((data) => {
          if (!isSubscribed) return;
          if (data.versions && JSON.stringify(data.versions) !== JSON.stringify(documentVersions)) {
            setDocumentVersions(data.versions);
          }
          if (data.activeVersionNum !== undefined && data.activeVersionNum !== activeVersionNum) {
            if (!sandboxSectionId) {
              setActiveVersionNum(data.activeVersionNum);
            }
          }
          if (data.comments && JSON.stringify(data.comments) !== JSON.stringify(comments)) {
            setComments(data.comments);
          }
          if (data.verdicts && JSON.stringify(data.verdicts) !== JSON.stringify(verdicts)) {
            setVerdicts(data.verdicts);
          }
        })
        .catch((err) => {
          console.error("Error polling state from server", err);
        });
    }, 3000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [mounted, authToken, activeDocumentId, documentVersions, activeVersionNum, comments, verdicts, sandboxSectionId]);

  // Auth handlers
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: usernameInput, password: passwordInput }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const role = data.user.role;
        if (role === "owner" || role === "collaborator" || role === "commenter" || role === "viewer") {
          setAuthToken(data.token);
          setCurrentUser({ name: data.user.name, role });
          localStorage.setItem("collab_token", data.token);
          setAuthError("");
          setUsernameInput("");
          setPasswordInput("");
        } else {
          setAuthError("Invalid user role received");
        }
      } else {
        setAuthError(data.error || "Invalid username or password");
      }
    } catch (err: any) {
      setAuthError(err.message || "An error occurred during sign in");
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: usernameInput, password: passwordInput, role: roleInput }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const role = data.user.role;
        if (role === "owner" || role === "collaborator" || role === "commenter" || role === "viewer") {
          setAuthToken(data.token);
          setCurrentUser({ name: data.user.name, role });
          localStorage.setItem("collab_token", data.token);
          setAuthError("");
          setUsernameInput("");
          setPasswordInput("");
        } else {
          setAuthError("Invalid user role received");
        }
      } else {
        setAuthError(data.error || "Failed to sign up");
      }
    } catch (err: any) {
      setAuthError(err.message || "An error occurred during sign up");
    }
  };

  const handleDemoLogin = async (username: string) => {
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password: "password" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const role = data.user.role;
        if (role === "owner" || role === "collaborator" || role === "commenter" || role === "viewer") {
          setAuthToken(data.token);
          setCurrentUser({ name: data.user.name, role });
          localStorage.setItem("collab_token", data.token);
          setAuthError("");
        } else {
          setAuthError("Invalid user role received");
        }
      } else {
        setAuthError(data.error || `Failed to log in as ${username}`);
      }
    } catch (err: any) {
      setAuthError(err.message || "An error occurred during demo login");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("collab_token");
    setAuthToken(null);
    setCurrentUser(null);
  };


  // Document version changes
  const currentVersion = documentVersions.find(v => v.versionNumber === activeVersionNum) || documentVersions[documentVersions.length - 1]!;

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

  // Bounding box calculation for sections to position inline actions
  const [sectionRects, setSectionRects] = useState<Record<string, { top: number; height: number }>>({});

  const recalculateRects = React.useCallback(() => {
    const newRects: Record<string, { top: number; height: number }> = {};
    const container = documentRootRef.current;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      sectionIds.forEach((secId) => {
        const el = document.getElementById(secId);
        if (el) {
          const rect = el.getBoundingClientRect();
          newRects[secId] = {
            top: rect.top - containerRect.top,
            height: rect.height
          };
        }
      });
    }
    setSectionRects(newRects);
  }, [sectionIds]);

  useEffect(() => {
    if (!mounted || !currentVersion.html) return;
    recalculateRects();
    const timer = setTimeout(recalculateRects, 150);
    
    window.addEventListener("resize", recalculateRects);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", recalculateRects);
    };
  }, [currentVersion.html, sectionIds, mounted, activeDocumentId, activeVersionNum, recalculateRects, currentUser]);

  // Hovering block actions states
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const [hoveredElRect, setHoveredElRect] = useState<{ top: number; left: number; height: number } | null>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".surgical-tool-card")) {
      return;
    }
    if (target.closest("[data-section-toolbar]")) {
      return;
    }
    const sectionEl = target.closest("[id]");
    if (sectionEl) {
      const id = sectionEl.getAttribute("id");
      if (id && id !== "top" && sectionIds.includes(id)) {
        setHoveredSectionId(id);
        const container = documentRootRef.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const rect = sectionEl.getBoundingClientRect();
          setHoveredElRect({
            top: rect.top - containerRect.top,
            left: rect.left - containerRect.left,
            height: rect.height
          });
        }
        return;
      }
    }
    setHoveredSectionId(null);
    setHoveredElRect(null);
  };

  // Detect text selection inside a section
  const handleSelection = (sectionId: string) => {
    if (!currentUser || !canComment(currentUser.role)) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const quote = range.toString().trim();
    if (!quote) return;

    // Verify selection is indeed inside this section
    const sectionEl = document.getElementById(sectionId);
    if (!sectionEl || !sectionEl.contains(range.commonAncestorContainer)) return;

    const fullText = sectionEl.textContent || "";
    const startIndex = fullText.indexOf(quote);

    if (startIndex !== -1) {
      const prefix = fullText.slice(Math.max(0, startIndex - 30), startIndex);
      const suffix = fullText.slice(startIndex + quote.length, startIndex + quote.length + 30);
      
      setSelectedText(quote);
      setSelectedRange({ quote, prefix, suffix });
      setCommentTargetSection(sectionId);
      setIsAddingComment(true);
    }
  };

  // Add Comment Submission
  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !currentUser) return;

    const id = "c" + Math.random().toString(36).substring(2, 9);
    const mentions: string[] = [];
    const regex = /@(\w+)/g;
    let match;
    while ((match = regex.exec(commentText)) !== null) {
      if (match[1]) mentions.push(match[1]);
    }

    const newComment: Comment = {
      id,
      versionId: `v${activeVersionNum}`,
      author: currentUser.name,
      body: commentText,
      createdAt: Date.now(),
      feedbackType: commentFeedbackType,
      lifecycle: "open",
      anchorStatus: "anchored",
      target: selectedRange ? {
        type: "text",
        quote: selectedRange.quote,
        prefix: selectedRange.prefix,
        suffix: selectedRange.suffix
      } : {
        type: "element",
        id: commentTargetSection,
        path: `section#${commentTargetSection}`,
        hash: 0,
        tag: "section",
        snippet: "Entire section comment"
      },
      lastKnownContext: selectedText || "Entire section comment",
      resolution: null,
      replies: [],
      mentions,
      history: [{ event: "created", who: currentUser.name, when: Date.now() }]
    };

    const newComments = [...comments, newComment];
    setComments(newComments);
    
    // Sync to server
    syncState(documentVersions, activeVersionNum, newComments, verdicts);

    // Clear forms
    setCommentText("");
    setIsAddingComment(false);
    setSelectedText("");
    setSelectedRange(null);
    // Switch to threads tab to show it
    setActiveTab("threads");
    setSelectedCommentId(id);
  };

  // Add Reply Submission
  const handleAddReply = (e: React.FormEvent, commentId: string) => {
    e.preventDefault();
    if (!replyText.trim() || !currentUser) return;

    const updatedComments = comments.map(c => {
      if (c.id === commentId) {
        const replyId = "r" + Math.random().toString(36).substring(2, 9);
        const newReply: Reply = {
          id: replyId,
          author: currentUser.name,
          body: replyText,
          mentions: [],
          ts: Date.now()
        };
        return {
          ...c,
          replies: [...c.replies, newReply],
          history: [...c.history, { event: `replied by ${currentUser.name}`, who: currentUser.name, when: Date.now() }]
        };
      }
      return c;
    });

    setComments(updatedComments);
    syncState(documentVersions, activeVersionNum, updatedComments, verdicts);
    setReplyText("");
  };

  // Resolve Comment
  const handleResolveComment = (commentId: string) => {
    if (!currentUser) return;
    const updatedComments = comments.map(c => {
      if (c.id === commentId) {
        return {
          ...c,
          lifecycle: c.lifecycle === "open" ? "resolved" : "open" as any,
          resolution: c.lifecycle === "open" ? {
            resolvedBy: currentUser.name,
            resolvedAt: Date.now()
          } : null,
          history: [...c.history, { 
            event: c.lifecycle === "open" ? "resolved" : "reopened", 
            who: currentUser.name, 
            when: Date.now() 
          }]
        };
      }
      return c;
    });
    setComments(updatedComments);
    syncState(documentVersions, activeVersionNum, updatedComments, verdicts);
  };

  // AI Surgical Edit Simulation
  const handleOpenAiEdit = (sectionId: string) => {
    setSandboxSectionId(sectionId);
    setSandboxPrompt("");
    setSandboxSimulatedHtml(null);
    setSandboxDiffHtml(null);
  };

  const PRESETS = [
    { label: "Executive Polish", prompt: "Rewrite this section to make it sound highly professional, polished, and ready for an executive presentation." },
    { label: "Make Concise", prompt: "Condense this section to make it extremely clear, short, and punchy, removing any filler words." },
    { label: "Detail Metrics & Targets", prompt: "Add detailed targets for active daily users (target 10,000) and claim processing times (target under 2 hours)." },
    { label: "Add HIPAA / Compliance Details", prompt: "Add details about data encryption, secure audit trails, and HIPAA compliance requirements." }
  ];

  const handleSimulateAiEdit = () => {
    if (!sandboxSectionId) return;
    setSandboxLoading(true);

    // Fetch existing section content
    const parser = new DOMParser();
    const doc = parser.parseFromString(currentVersion.html, "text/html");
    const sectionEl = doc.getElementById(sandboxSectionId);
    const oldSectionHtml = sectionEl ? sectionEl.outerHTML : "";

    setTimeout(() => {
      // Simulated response mapping
      let newSectionHtml = "";
      const lowercasePrompt = sandboxPrompt.toLowerCase();

      if (sandboxSectionId === "intro") {
        if (lowercasePrompt.includes("professional") || lowercasePrompt.includes("executive") || lowercasePrompt.includes("polish")) {
          newSectionHtml = `<section id="intro" class="p-6 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-indigo-150 transition-all duration-200">
  <h2 class="text-xl font-semibold text-slate-900 mb-2 font-display">1. Executive Summary & Context</h2>
  <p class="text-slate-600 leading-relaxed font-sans">
    DentalTechHub represents our flagship enterprise solution for modern dental practices. By seamlessly unifying patient scheduling, insurance claims processing, and clinical treatment workflows, the platform addresses critical administrative inefficiencies. Our projections show a conservative 30% reduction in operational overhead while significantly elevating patient experience.
  </p>
</section>`;
        } else if (lowercasePrompt.includes("concise") || lowercasePrompt.includes("short")) {
          newSectionHtml = `<section id="intro" class="p-6 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-indigo-150 transition-all duration-200">
  <h2 class="text-xl font-semibold text-slate-900 mb-2 font-display">1. Executive Summary & Context</h2>
  <p class="text-slate-600 leading-relaxed font-sans">
    DentalTechHub is an all-in-one dental practice management platform. It integrates scheduling, billing, and treatment planning to cut administrative overhead by 30%.
  </p>
</section>`;
        } else {
          newSectionHtml = `<section id="intro" class="p-6 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-indigo-150 transition-all duration-200">
  <h2 class="text-xl font-semibold text-slate-900 mb-2 font-display">1. Executive Summary & Context</h2>
  <p class="text-slate-600 leading-relaxed font-sans">
    DentalTechHub is a modern software platform for dental clinics. It integrates patient scheduling, insurance claims processing, and treatment planning into a single, intuitive interface. Our primary target is to reduce administrative overhead by 30% and improve patient engagement. [Added: ${sandboxPrompt}]
  </p>
</section>`;
        }
      } else if (sandboxSectionId === "goals") {
        if (lowercasePrompt.includes("metric") || lowercasePrompt.includes("target")) {
          newSectionHtml = `<section id="goals" class="p-6 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-indigo-150 transition-all duration-200">
  <h2 class="text-xl font-semibold text-slate-900 mb-2 font-display">2. Targets & Core Metrics</h2>
  <p class="text-slate-600 leading-relaxed font-sans">
    We aim to onboard 500 active dental clinics across the country by Q4, reaching a milestone of 10,000 active daily users. The key metrics include active daily clinic users, average insurance claim processing time (targeted under 2 hours), and patient satisfaction scores. We will also monitor server latency and API reliability.
  </p>
</section>`;
        } else {
          newSectionHtml = `<section id="goals" class="p-6 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-indigo-150 transition-all duration-200">
  <h2 class="text-xl font-semibold text-slate-900 mb-2 font-display">2. Targets & Core Metrics</h2>
  <p class="text-slate-600 leading-relaxed font-sans">
    We aim to onboard 500 active dental clinics across the country by Q4. The key metrics include active daily clinic users, average insurance claim processing time, and patient satisfaction scores. [AI Edit: ${sandboxPrompt}]
  </p>
</section>`;
        }
      } else if (sandboxSectionId === "security") {
        if (lowercasePrompt.includes("hipaa") || lowercasePrompt.includes("compliance") || lowercasePrompt.includes("encrypt")) {
          newSectionHtml = `<section id="security" class="p-6 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-indigo-150 transition-all duration-200">
  <h2 class="text-xl font-semibold text-slate-900 mb-2 font-display">4. Security & HIPAA Compliance</h2>
  <p class="text-slate-600 leading-relaxed font-sans">
    All patient health records must be encrypted both in transit and at rest. The platform must fully comply with all HIPAA regulations, including rigorous audit logging, secure access controls, and signed Business Associate Agreements (BAAs). We will undergo external security penetration testing and audits twice a year to maintain compliance.
  </p>
</section>`;
        } else {
          newSectionHtml = `<section id="security" class="p-6 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-indigo-150 transition-all duration-200">
  <h2 class="text-xl font-semibold text-slate-900 mb-2 font-display">4. Security & HIPAA Compliance</h2>
  <p class="text-slate-600 leading-relaxed font-sans">
    All patient health records must be encrypted both in transit and at rest. The platform must fully comply with all HIPAA regulations. [AI Edit: ${sandboxPrompt}]
  </p>
</section>`;
        }
      } else if (sandboxSectionId === "background") {
        newSectionHtml = oldSectionHtml
          .replace("analytics", "advanced analytics")
          .replace("redundancy", "inefficiency");
      } else {
        let updated = oldSectionHtml;
        if (updated.includes("Vendor") || updated.includes("vendor")) {
          updated = updated.replace(/Vendor/g, "Provider").replace(/vendor/g, "provider");
        } else {
          updated = updated.replace(/the/gi, "the updated");
        }
        newSectionHtml = updated;
      }

      setSandboxSimulatedHtml(newSectionHtml);

      // Compute inline diff preview using diff-match-patch
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
      setSandboxLoading(false);
    }, 800);
  };

  const handleCommitAiEdit = () => {
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
    const nextVersionNum = documentVersions.length + 1;

    // Create a new version
    const newVersion = {
      versionNumber: nextVersionNum,
      html: updatedHtml,
      status: "Draft" as const,
      timestamp: new Date().toISOString()
    };

    const newVersions = [...documentVersions, newVersion];
    setDocumentVersions(newVersions);
    setActiveVersionNum(nextVersionNum);

    // Re-anchor active comments using the locate() tool from htmlcollab-app
    const containerDiv = document.createElement("div");
    containerDiv.innerHTML = updatedHtml;
    
    const updatedComments = comments.map(c => {
      if (c.lifecycle === "resolved") return c;
      const locateResult = locate(containerDiv, c);
      
      // Update history record
      const hasReanchored = locateResult.status !== c.anchorStatus;
      const historyUpdate = hasReanchored 
        ? [{ event: `re-anchored to status: ${locateResult.status} due to v${nextVersionNum} edit`, who: "System", when: Date.now() }]
        : [];

      return {
        ...c,
        anchorStatus: locateResult.status,
        posStart: locateResult.status !== "orphaned" ? locateResult.start : undefined,
        posEnd: locateResult.status !== "orphaned" ? locateResult.end : undefined,
        lastKnownContext: locateResult.newText || locateResult.newSnippet || c.lastKnownContext,
        history: [...c.history, ...historyUpdate]
      };
    });

    setComments(updatedComments);
    setSandboxSectionId(null);
    syncState(newVersions, nextVersionNum, updatedComments, verdicts);
  };

  // Document Verdict Change
  const handleVerdictChange = (val: "approve" | "changes" | "block" | null) => {
    if (!currentUser) return;
    const newVerdicts = {
      ...verdicts,
      [currentUser.name]: val
    };
    setVerdicts(newVerdicts);
    syncState(documentVersions, activeVersionNum, comments, newVerdicts);
  };

  // Promoting version to Live status
  const handlePromoteToLive = () => {
    const updatedVersions = documentVersions.map(v => {
      if (v.versionNumber === activeVersionNum) {
        return { ...v, status: "Live" as const };
      }
      return v;
    });
    setDocumentVersions(updatedVersions);
    syncState(updatedVersions, activeVersionNum, comments, verdicts);
  };

  // Creating new draft from Live
  const handleCreateNewDraft = () => {
    const nextVersionNum = documentVersions.length + 1;
    const newVersion = {
      versionNumber: nextVersionNum,
      html: currentVersion.html,
      status: "Draft" as const,
      timestamp: new Date().toISOString()
    };
    const newVersions = [...documentVersions, newVersion];
    setDocumentVersions(newVersions);
    setActiveVersionNum(nextVersionNum);
    syncState(newVersions, nextVersionNum, comments, verdicts);
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

  // Highlight comments in DOM dynamically
  const getHighlightedHtml = () => {
    if (!mounted || typeof window === "undefined") return currentVersion.html;

    const parser = new DOMParser();
    const doc = parser.parseFromString(currentVersion.html, "text/html");
    const container = doc.body;

    comments.forEach(c => {
      if (c.lifecycle === "resolved") return;
      if (c.target.type === "text") {
        const quote = c.target.quote;
        
        // Find sections
        const walk = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let textNode;
        while ((textNode = walk.nextNode())) {
          const text = textNode.nodeValue || "";
          const idx = text.indexOf(quote);
          if (idx !== -1 && textNode.parentNode) {
            const parent = textNode.parentNode as HTMLElement;
            // Ensure we aren't editing inside script or existing highlight
            if (parent.tagName === "MARK" || parent.tagName === "SCRIPT" || parent.tagName === "STYLE") continue;

            const before = text.slice(0, idx);
            const after = text.slice(idx + quote.length);
            
            const beforeNode = doc.createTextNode(before);
            const mark = doc.createElement("mark");
            mark.className = `cursor-pointer transition-colors px-0.5 rounded-sm border-b-2 font-medium ${
              selectedCommentId === c.id 
                ? "bg-indigo-200 border-indigo-500 text-indigo-900 shadow-sm" 
                : "bg-amber-100 border-amber-400 text-amber-900 hover:bg-amber-200"
            }`;
            mark.setAttribute("data-comment-id", c.id);
            mark.textContent = quote;
            const afterNode = doc.createTextNode(after);
            
            const parentNode = textNode.parentNode;
            if (parentNode) {
              parentNode.insertBefore(beforeNode, textNode);
              parentNode.insertBefore(mark, textNode);
              parentNode.insertBefore(afterNode, textNode);
              parentNode.removeChild(textNode);
            }
            break;
          }
        }
      }
    });

    return container.innerHTML;
  };

  const handleDocumentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
    if (anchor) {
      const href = anchor.getAttribute("href");
      if (href && href.startsWith("#")) {
        e.preventDefault();
        const targetId = href.slice(1);
        if (previewContainerRef.current) {
          const container = previewContainerRef.current;
          if (targetId === "top") {
            container.scrollTo({ top: 0, behavior: "smooth" });
          } else {
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
              const containerRect = container.getBoundingClientRect();
              const targetRect = targetEl.getBoundingClientRect();
              const scrollOffset = targetRect.top - containerRect.top + container.scrollTop;
              container.scrollTo({ top: scrollOffset, behavior: "smooth" });
            }
          }
        }
        return;
      }
    }

    const mark = target.closest("mark");
    if (mark) {
      const commentId = mark.getAttribute("data-comment-id");
      if (commentId) {
        setSelectedCommentId(commentId);
        setActiveTab("threads");
        const element = document.getElementById(`sidebar-comment-${commentId}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    }
  };

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
  }

  // 1. Auth Lock Screen
  if (!authToken || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-indigo-100 px-4 py-12 sm:px-6 lg:px-8 font-sans">
        <div className="max-w-md w-full space-y-6 glass-panel p-8 rounded-3xl shadow-xl border border-white/80 animate-fade-in">
          <div className="text-center">
            <div className="mx-auto h-14 w-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Lock className="h-7 w-7 text-white" />
            </div>
            <h2 className="mt-4 text-3xl font-extrabold text-slate-900 tracking-tight font-display">
              HTMLCollab Workspace
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Sign in or create a new account to access the collaborative review dashboard.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex border border-slate-200/60 bg-slate-100/50 p-1 gap-1 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setAuthTab("signin");
                setAuthError("");
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                authTab === "signin"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/30"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthTab("signup");
                setAuthError("");
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                authTab === "signup"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/30"
              }`}
            >
              Sign Up
            </button>
          </div>

          {authTab === "signin" ? (
            <form className="space-y-4" onSubmit={handleSignIn}>
              <div className="space-y-3">
                <div>
                  <label htmlFor="signin-username" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Username
                  </label>
                  <input
                    id="signin-username"
                    name="username"
                    type="text"
                    required
                    data-testid="login-token-input"
                    className="appearance-none rounded-xl relative block w-full px-4 py-2.5 border border-slate-200 placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                    placeholder="Enter username"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="signin-password" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Password
                  </label>
                  <input
                    id="signin-password"
                    name="password"
                    type="password"
                    required
                    className="appearance-none rounded-xl relative block w-full px-4 py-2.5 border border-slate-200 placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                    placeholder="Enter password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                  />
                </div>
              </div>

              {authError && (
                <div className="text-red-600 text-xs font-medium flex items-center gap-1.5 animate-shake">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  data-testid="login-submit-button"
                  className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-xs font-bold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-md shadow-indigo-150 cursor-pointer"
                >
                  Sign In
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleSignUp}>
              <div className="space-y-3">
                <div>
                  <label htmlFor="signup-username" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Username
                  </label>
                  <input
                    id="signup-username"
                    name="username"
                    type="text"
                    required
                    className="appearance-none rounded-xl relative block w-full px-4 py-2.5 border border-slate-200 placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                    placeholder="Choose username"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="signup-password" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Password
                  </label>
                  <input
                    id="signup-password"
                    name="password"
                    type="password"
                    required
                    className="appearance-none rounded-xl relative block w-full px-4 py-2.5 border border-slate-200 placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                    placeholder="Choose password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="signup-role" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Role
                  </label>
                  <select
                    id="signup-role"
                    name="role"
                    required
                    className="appearance-none rounded-xl relative block w-full px-4 py-2.5 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                    value={roleInput}
                    onChange={(e) => setRoleInput(e.target.value as any)}
                  >
                    <option value="owner">Owner</option>
                    <option value="collaborator">Collaborator</option>
                    <option value="commenter">Commenter</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              </div>

              {authError && (
                <div className="text-red-600 text-xs font-medium flex items-center gap-1.5 animate-shake">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-xs font-bold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-md shadow-indigo-150 cursor-pointer"
                >
                  Create Account
                </button>
              </div>
            </form>
          )}

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="px-2 bg-white/40 text-slate-400 font-bold">Quick Demo Logins</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleDemoLogin("Sam")}
              data-testid="token-btn-owner"
              className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white/60 hover:bg-white text-left hover:border-indigo-200 transition-all text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <span>Sam (Owner)</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button
              onClick={() => handleDemoLogin("Nirat")}
              data-testid="token-btn-collaborator"
              className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white/60 hover:bg-white text-left hover:border-indigo-200 transition-all text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <span>Nirat (Collab)</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button
              onClick={() => handleDemoLogin("Priya")}
              data-testid="token-btn-commenter"
              className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white/60 hover:bg-white text-left hover:border-indigo-200 transition-all text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <span>Priya (Commenter)</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button
              onClick={() => handleDemoLogin("Alex")}
              data-testid="token-btn-viewer"
              className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white/60 hover:bg-white text-left hover:border-indigo-200 transition-all text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <span>Alex (Viewer)</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Collaborative Review Dashboard
  return (
    <div className="pane-layout-container font-sans text-slate-900">
      
      {/* Left Sidebar */}
      <aside
        id="tour-sidebar"
        className={`w-64 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800 shrink-0 h-screen transition-all ${
          tourStep === 0 ? "ring-4 ring-indigo-500 ring-offset-2 ring-offset-slate-900 z-50 animate-pulse" : ""
        }`}
      >
        {/* Workspace Title & Brand */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-2.5">
          <div className="h-8 w-8 bg-gradient-to-tr from-indigo-500 to-indigo-400 rounded-lg flex items-center justify-center shadow-md">
            <Sparkles className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white leading-none">HTMLCollab</h1>
            <span className="text-[10px] text-slate-400 font-medium font-mono">WORKSPACE</span>
          </div>
        </div>

        {/* Search Documents */}
        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <input
              type="text"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/60 rounded-lg px-2.5 py-1.5 pl-8 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="absolute left-2.5 top-2 text-slate-500">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
          </div>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="flex items-center justify-between px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span>Documents</span>
            <button
              onClick={() => setIsCreateDocModalOpen(true)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
              title="New Document"
              data-testid="create-new-doc-btn"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          
          <div className="space-y-0.5">
            {documents
              .filter((doc) => doc.name.toLowerCase().includes(searchTerm.toLowerCase()))
              .map((doc) => {
                const isActive = doc.id === activeDocumentId;
                return (
                  <button
                    key={doc.id}
                    onClick={() => setActiveDocumentId(doc.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? "bg-indigo-600 text-white font-bold"
                        : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                    }`}
                  >
                    <FileText className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                    <span className="truncate flex-1">{doc.name}</span>
                  </button>
                );
              })}
            {documents.filter((doc) => doc.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
              <p className="text-[11px] text-slate-500 text-center py-4 font-medium italic">No documents found</p>
            )}
          </div>
        </div>

        {/* User Profile Info & Tour Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40 space-y-2.5">
          {currentUser && (
            <div className="flex items-center gap-2 px-1">
              <div className="h-7 w-7 rounded-full bg-slate-800 text-indigo-400 flex items-center justify-center text-xs font-bold uppercase border border-slate-700">
                {currentUser.name[0]}
              </div>
              <div className="text-left leading-tight flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{currentUser.name}</p>
                <p className="text-[10px] font-medium text-slate-400 capitalize">{currentUser.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors cursor-pointer"
                title="Log Out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Replay tour and metadata */}
          <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-[10px] text-slate-500 font-semibold">
            <button
              onClick={() => startTour()}
              className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer py-1 px-1.5 rounded hover:bg-slate-800"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span>Replay Tour</span>
            </button>
            <span className="font-mono opacity-80">v1.2.0</span>
          </div>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <div className="pane-workspace-frame">
        
        {/* Premium Header */}
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold tracking-tight font-display text-slate-900 flex items-center gap-2">
                <FileText className="h-4.5 w-4.5 text-indigo-600" />
                {documents.find((d) => d.id === activeDocumentId)?.name || "Loading Document..."}
              </h1>
              <p className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wider">Active Workspace Document</p>
            </div>
          </div>

        <div className="flex items-center gap-3">
          {/* Version Selector */}
          <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1.5 border border-slate-200/50">
            <span className="text-xs font-bold text-slate-500 px-2">Version:</span>
            <select
              value={activeVersionNum}
              onChange={(e) => setActiveVersionNum(Number(e.target.value))}
              className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {documentVersions.map((v) => (
                <option key={v.versionNumber} value={v.versionNumber}>
                  v{v.versionNumber} ({v.status})
                </option>
              ))}
            </select>
          </div>

          {/* Convert Document Action */}
          {currentUser && (currentUser.role === "owner" || currentUser.role === "collaborator") && (
            <button
              onClick={() => setIsConvertModalOpen(true)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-1.5 px-3 rounded-xl text-xs transition-colors shadow-sm cursor-pointer"
            >
              ✨ Convert Document
            </button>
          )}

          {/* Current User Badge */}
          <div className="flex items-center gap-2.5 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200/60 shadow-sm">
            <div className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold uppercase">
              {currentUser.name[0]}
            </div>
            <div className="text-left leading-none">
              <p className="text-xs font-semibold text-slate-800">{currentUser.name}</p>
              <p className="text-[10px] font-medium text-slate-400 capitalize">{currentUser.role}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors border border-slate-100 cursor-pointer"
            title="Log Out"
          >
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="pane-main-content">
        
        {/* Left Hand Document Column */}
        <div className="pane-center-preview">
          
          {/* North-star Alignment Banner */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 font-display flex items-center gap-1.5">
                <UserCheck className="h-4 w-4 text-indigo-600" />
                Alignment Sign-off Verdicts
              </h3>
              <p className="text-xs text-slate-500 font-sans">
                The consensus gauge for final implementation sign-off.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(verdicts).map(([user, verdict]) => (
                <div 
                  key={user} 
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold ${
                    verdict === "approve" ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
                    verdict === "changes" ? "bg-amber-50 border-amber-200 text-amber-800" :
                    verdict === "block" ? "bg-rose-50 border-rose-200 text-rose-800" :
                    "bg-slate-50 border-slate-200 text-slate-500"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                  {user}: {verdict === "approve" ? "Approved" : verdict === "changes" ? "Request Changes" : verdict === "block" ? "Blocked" : "Pending"}
                </div>
              ))}
            </div>

            <div className="border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-4 flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your Verdict:</span>
              <select
                value={verdicts[currentUser.name] || ""}
                onChange={(e) => handleVerdictChange(e.target.value as any || null)}
                data-testid="verdict-select"
                className="text-xs font-bold border border-slate-200 rounded-lg px-2.5 py-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50 cursor-pointer"
              >
                <option value="">Pending...</option>
                <option value="approve">🟢 Approve</option>
                <option value="changes">🟡 Request Changes</option>
                <option value="block">🔴 Block</option>
              </select>
            </div>
          </div>

          {/* Document Content Box */}
          <div 
            id="tour-center-preview"
            className={`bg-white rounded-2xl border border-slate-200/80 shadow-sm flex-1 flex flex-col overflow-hidden transition-all ${
              tourStep === 1 ? "ring-4 ring-indigo-500 ring-offset-2 z-50" : ""
            }`}
          >
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4.5 w-4.5 text-indigo-600" />
                <span className="text-sm font-bold text-slate-800 font-display">
                  {documents.find((d) => d.id === activeDocumentId)?.name || "Document Preview"}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  currentVersion.status === "Live" ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800"
                }`}>
                  {currentVersion.status}
                </span>
              </div>

              {canEdit(currentUser.role) && (
                <div>
                  {currentVersion.status === "Draft" ? (
                    <button
                      onClick={handlePromoteToLive}
                      className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl transition-colors shadow-sm cursor-pointer"
                    >
                      Promote to Live
                    </button>
                  ) : (
                    <button
                      onClick={handleCreateNewDraft}
                      className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-xl transition-colors shadow-sm cursor-pointer"
                    >
                      Create New Draft
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Document Review Body */}
            <div 
              ref={previewContainerRef}
              className="pane-preview-body"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => {
                setHoveredSectionId(null);
                setHoveredElRect(null);
              }}
              onScroll={recalculateRects}
            >
              {hoveredSectionId && (
                <style>{`
                  #${hoveredSectionId} {
                    border-left: 3px solid #6366f1 !important;
                    background-color: rgba(99, 102, 241, 0.02) !important;
                    padding-left: 8px !important;
                  }
                `}</style>
              )}
              
              <div 
                ref={documentRootRef}
                className="space-y-6 select-text"
                onClick={(e) => {
                  handleDocumentClick(e);
                  setTimeout(recalculateRects, 100);
                }}
              >
                {/* Dynamically parsed sections from HTML */}
                {currentVersion.html.includes("id=") ? (
                  <div 
                    dangerouslySetInnerHTML={{ __html: getHighlightedHtml() }} 
                    className="relative cursor-text"
                    onMouseUp={() => {
                      // Handled selection per section
                    }}
                  />
                ) : (
                  <div className="text-slate-500 text-sm">Document HTML format incorrect.</div>
                )}
              </div>

              {/* Floating Inline Block Tools Overlay */}
              {sectionIds.map((secId) => {
                const rect = sectionRects[secId];
                if (!rect) return null;
                const isHovered = hoveredSectionId === secId;
                if (!isHovered) return null;
                const sectionMeta = sectionsMetadata.find(m => m.id === secId);
                return (
                  <div 
                    key={secId}
                    data-section-toolbar={secId}
                    className="absolute right-4 md:right-6 bg-white/95 backdrop-blur-md border border-indigo-100 shadow-lg rounded-xl p-1 z-40 flex items-center gap-1.5 ring-1 ring-indigo-500/20 animate-toolbar-fade-in"
                    style={{
                      top: rect.top + 6,
                    }}
                  >
                    <div className="flex items-center gap-1 border-r border-slate-150 pr-1.5 pl-1">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 px-1.5 py-0.5 rounded-md truncate max-w-[80px] xs:max-w-[100px] sm:max-w-[140px]" title={sectionMeta?.title || secId}>
                        {sectionMeta?.title || secId}
                      </span>
                    </div>
                    
                    <div className="flex gap-1">
                      {canEdit(currentUser.role) && currentVersion.status === "Draft" && (
                        <button
                          onClick={() => handleOpenAiEdit(secId)}
                          data-testid={`ai-edit-btn-${secId}`}
                          className="flex items-center gap-1.5 py-1 px-2.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg text-[10px] font-bold transition-all whitespace-nowrap cursor-pointer"
                          title="Surgical AI Edit"
                        >
                          <Sparkles className="h-3 w-3 shrink-0" />
                          <span>AI Edit</span>
                        </button>
                      )}
                      {canComment(currentUser.role) && (
                        <button
                          onClick={() => {
                            setSelectedText("");
                            setSelectedRange(null);
                            setCommentTargetSection(secId);
                            setIsAddingComment(true);
                          }}
                          data-testid={`comment-btn-${secId}`}
                          className="flex items-center gap-1 py-1 px-2.5 bg-slate-50 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition-all border border-slate-200/50 whitespace-nowrap cursor-pointer"
                          title="Comment on section"
                        >
                          <MessageSquare className="h-3 w-3 shrink-0" />
                          <span>Comment</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Surgical Block Guide & Panel */}
              <div 
                id="tour-section-tools"
                className={`border-t border-slate-100 pt-6 mt-6 flex flex-col gap-3 transition-all ${
                  tourStep === 2 ? "ring-4 ring-indigo-500 ring-offset-2 p-3 rounded-xl bg-indigo-50/20 border-indigo-200/30 z-50 animate-pulse" : ""
                }`}
              >
                <div className="bg-indigo-50/50 rounded-2xl border border-indigo-100/50 p-4 font-sans">
                  <div className="flex gap-3">
                    <div className="h-8 w-8 bg-indigo-100/60 rounded-lg flex items-center justify-center text-indigo-600 shrink-0">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wide">Surgical Block Editing</h4>
                      <p className="text-xs text-indigo-855 mt-1 leading-relaxed">
                        Viscollab structures documents into logical blocks (like <strong>Background</strong> or <strong>Required Actions</strong>). Hover over any section in the preview above to display inline AI rewriting and commenting tools. This edits only the target block, guaranteeing 100% containment of all other sections.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Hand Sidebar Column */}
        <aside 
          id="tour-right-collab"
          className={`pane-right-sidebar transition-all ${
            tourStep === 3 ? "ring-4 ring-indigo-500 ring-offset-2 z-50 animate-pulse" : ""
          }`}
        >
          <div className="pane-right-sidebar-scroll flex flex-col gap-6">
          
          {/* Add Comment card modal inline */}
          {isAddingComment && (
            <div className="bg-amber-50/70 border border-amber-200 p-5 rounded-2xl shadow-sm animate-fade-in space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                  <Plus className="h-4 w-4" />
                  New Comment
                </span>
                <button onClick={() => setIsAddingComment(false)} className="text-amber-600 hover:text-amber-800 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {selectedText && (
                <div className="bg-white/80 p-2.5 rounded-lg border border-amber-100 text-xs text-slate-700 leading-snug">
                  <span className="font-bold block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-display">Highlighted context</span>
                  "{selectedText}"
                </div>
              )}

              <form onSubmit={handleAddComment} className="space-y-3">
                <div>
                  <textarea
                    required
                    data-testid="comment-body-input"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none placeholder-slate-400 font-sans"
                    placeholder="Type your comment... Use @name for mentions"
                    rows={3}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type</span>
                    <select
                      data-testid="comment-feedback-type"
                      value={commentFeedbackType || ""}
                      onChange={(e) => setCommentFeedbackType(e.target.value as any || null)}
                      className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none"
                    >
                      <option value="question">❓ Question</option>
                      <option value="approve">🟢 Approval</option>
                      <option value="flag">🚩 Flag risk</option>
                      <option value="needs">📋 Needs Data</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    data-testid="comment-submit-button"
                    className="mt-5 bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-3.5 rounded-xl text-xs font-semibold transition-colors shadow-sm cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Sidebar Navigation Tabs */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col flex-1 overflow-hidden min-h-[450px]">
            <div className="flex border-b border-slate-200 bg-slate-50/50 p-1 gap-1">
              <button
                onClick={() => setActiveTab("threads")}
                data-testid="sidebar-tab-threads"
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "threads" 
                    ? "bg-white text-indigo-700 shadow-sm" 
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Threads
              </button>
              <button
                onClick={() => setActiveTab("decisions")}
                data-testid="sidebar-tab-decisions"
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "decisions" 
                    ? "bg-white text-indigo-700 shadow-sm" 
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
                }`}
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Decisions
              </button>
              <button
                onClick={() => setActiveTab("actions")}
                data-testid="sidebar-tab-actions"
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "actions" 
                    ? "bg-white text-indigo-700 shadow-sm" 
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Actions
              </button>
            </div>

            {/* Sidebar Tab Area */}
            <div className="p-4 flex-1 overflow-y-auto max-h-[500px]">
              
              {/* Tab 1: Threads */}
              {activeTab === "threads" && (
                <div className="space-y-4">
                  {comments.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      No discussion threads active.
                    </div>
                  ) : (
                    comments.map((comment) => (
                      <div
                        key={comment.id}
                        id={`sidebar-comment-${comment.id}`}
                        data-testid="comment-item"
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                          selectedCommentId === comment.id 
                            ? "bg-indigo-50/50 border-indigo-200 ring-1 ring-indigo-200" 
                            : "bg-slate-50/40 border-slate-200 hover:border-slate-300"
                        }`}
                        onClick={() => setSelectedCommentId(comment.id)}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-800">{comment.author}</span>
                            <span className="text-[9px] text-slate-400">
                              {new Date(comment.createdAt).toLocaleTimeString([], {hour: "2-digit", minute:"2-digit"})}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Feedback badges */}
                            {comment.feedbackType === "needs" && (
                              <span className="bg-amber-100 text-amber-800 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">Needs Data</span>
                            )}
                            {comment.feedbackType === "flag" && (
                              <span className="bg-rose-100 text-rose-800 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">Risk</span>
                            )}
                            {comment.feedbackType === "approve" && (
                              <span className="bg-emerald-100 text-emerald-800 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">Approved</span>
                            )}
                            {comment.feedbackType === "question" && (
                              <span className="bg-sky-100 text-sky-800 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">Question</span>
                            )}
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              comment.lifecycle === "resolved" ? "bg-slate-200 text-slate-600" : "bg-indigo-100 text-indigo-700"
                            }`}>
                              {comment.lifecycle}
                            </span>
                          </div>
                        </div>

                        {comment.target.type === "text" && (
                          <div className="text-[10px] text-slate-500 italic bg-white/70 p-1.5 rounded border border-slate-100 mb-2 truncate">
                            "{comment.target.quote}"
                          </div>
                        )}

                        <p className="text-xs text-slate-700 leading-relaxed font-sans">{comment.body}</p>

                        {/* Replies */}
                        {comment.replies.length > 0 && (
                          <div className="mt-3 pl-3 border-l-2 border-indigo-100 space-y-2.5">
                            {comment.replies.map((reply: any) => (
                              <div key={reply.id} className="text-xs">
                                <div className="flex items-center gap-1.5 text-[10px] mb-0.5">
                                  <span className="font-bold text-slate-700">{reply.author}</span>
                                  <span className="text-slate-400">
                                    {new Date(reply.ts).toLocaleTimeString([], {hour: "2-digit", minute:"2-digit"})}
                                  </span>
                                </div>
                                <p className="text-slate-600 font-sans leading-relaxed">{reply.body}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Reply Form */}
                        {selectedCommentId === comment.id && (
                          <div className="mt-3 pt-3 border-t border-slate-200/60 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                            <form onSubmit={(e) => handleAddReply(e, comment.id)} className="flex items-center gap-1.5">
                              <input
                                type="text"
                                className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                                placeholder="Type reply..."
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                              />
                              <button
                                type="submit"
                                className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors cursor-pointer"
                              >
                                <Send className="h-3 w-3" />
                              </button>
                            </form>

                            {/* Resolve status button */}
                            {currentUser.role !== "viewer" && (
                              <button
                                onClick={() => handleResolveComment(comment.id)}
                                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold self-start mt-1 flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="h-3.5 w-3.5" />
                                {comment.lifecycle === "open" ? "Mark Resolved" : "Reopen Thread"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 2: Decisions Log */}
              {activeTab === "decisions" && (
                <div className="space-y-4 font-sans">
                  {decisions.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      No decisions recorded yet. Add comments with "Approval" tags to populate.
                    </div>
                  ) : (
                    decisions.map((item) => (
                      <div 
                        key={item.id} 
                        data-testid="decision-item"
                        className="bg-emerald-50/30 border border-emerald-100 p-4 rounded-xl space-y-2 hover-lift"
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-bold text-emerald-800 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            Approved
                          </span>
                          <span className="text-slate-400 font-medium">Ver: {item.versionId}</span>
                        </div>
                        <p className="text-xs text-slate-800 font-semibold">{item.body}</p>
                        {item.target.type === "text" && (
                          <p className="text-[10px] text-slate-500 italic">Context: "{item.target.quote}"</p>
                        )}
                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium pt-1">
                          <span>Signed off by: {item.author}</span>
                          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 3: Action Items */}
              {activeTab === "actions" && (
                <div className="space-y-4 font-sans">
                  {actionItems.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      No flagged action items. Mark comments with "Risk" or "Needs Data".
                    </div>
                  ) : (
                    actionItems.map((item) => {
                      const assignees = getAssignees(item);
                      return (
                        <div 
                          key={item.id} 
                          data-testid="action-item"
                          className="bg-rose-50/20 border border-rose-100 p-4 rounded-xl space-y-2 hover-lift"
                        >
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-rose-800 flex items-center gap-1">
                              {item.feedbackType === "needs" ? (
                                <HelpCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                              ) : (
                                <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                              )}
                              {item.feedbackType === "needs" ? "Needs Data" : "Action Required"}
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              item.lifecycle === "resolved" ? "bg-slate-200 text-slate-600" : "bg-rose-100 text-rose-700"
                            }`}>
                              {item.lifecycle}
                            </span>
                          </div>
                          
                          <p className="text-xs text-slate-800 leading-relaxed">{item.body}</p>
                          
                          {/* Assignee badges */}
                          {assignees.length > 0 && (
                            <div className="flex items-center gap-1 pt-1.5">
                              <span className="text-[9px] text-slate-400 font-semibold mr-1">Assignees:</span>
                              {assignees.map(name => (
                                <span key={name} className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-[8px] font-bold px-1.5 py-0.5 rounded">
                                  @{name}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium pt-1">
                            <span>Raised by: {item.author}</span>
                            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
          </div> {/* Closing pane-right-sidebar-scroll */}
        </aside>
      </div> {/* Closing pane-main-content */}

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
                      Simulate LLM Edit
                    </>
                  )}
                </button>
              </div>

              {/* Diff Preview */}
              {sandboxDiffHtml && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-display">Unified Inline Diff Preview</span>
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
                  Upload .docx File
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
                  Paste Google Docs HTML
                </button>
              </div>

              {/* Option A: Docx File Upload */}
              {convertOption === "docx" && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-display">
                    Select Word Document (.docx)
                  </label>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-200 border-dashed rounded-2xl cursor-pointer bg-slate-50 hover:bg-slate-100/50 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <FileText className="h-8 w-8 text-slate-400 mb-2" />
                        <p className="text-xs text-slate-600 font-semibold mb-1">
                          {docxFile ? docxFile.name : "Click to select a .docx file"}
                        </p>
                        <p className="text-[10px] text-slate-400">Microsoft Word files only</p>
                      </div>
                      <input
                        type="file"
                        accept=".docx"
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
              )}

              {/* Option B: Raw HTML Paste */}
              {convertOption === "paste" && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-display">
                    Google Docs Raw HTML
                  </label>
                  <textarea
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none placeholder-slate-400 font-mono"
                    placeholder="Paste <html>...</html> or <div>...</div> code from Google Docs here..."
                    rows={8}
                    value={pasteHtml}
                    onChange={(e) => setPasteHtml(e.target.value)}
                  />
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
                disabled={isConverting || (convertOption === "docx" ? !docxFile : !pasteHtml.trim())}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold py-2 px-5 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-100 cursor-pointer"
              >
                {isConverting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1"></div>
                    Converting and validating document...
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
      </div> {/* Closing Main Workspace Frame */}
    </div>
  );
}
