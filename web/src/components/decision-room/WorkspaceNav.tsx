"use client";

/**
 * WorkspaceNav (ROOM-002) — the left nav content: workspace selector, document
 * search, document list (+ convert button), user footer (logout + restart
 * tour). Moved out of DecisionRoomApp's old `<aside>` and restyled LIGHT (the
 * old slate-900 aside violated the tenets for new UI — brief §11 C1). Behavior
 * is unchanged; the `tour-sidebar` id stays on the wrapping `<aside>` in
 * DecisionRoomLayout, not here (this component is the aside's CONTENT).
 *
 * Presentational only: props in, callbacks out. `WorkspaceSelector` is reused
 * as-is (it fetches its own workspace list internally, unchanged pre-existing
 * behavior).
 */

import { FileText, HelpCircle, LogOut, Plus } from "lucide-react";
import WorkspaceSelector from "@/components/WorkspaceSelector";
import "@/app/decision-room.css";

export interface WorkspaceNavDocument {
  id: string;
  name: string;
  createdAt: string;
  members?: { username: string; role: string }[];
}

export interface WorkspaceNavProps {
  activeWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onOpenWorkspaceSettings: () => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  documents: WorkspaceNavDocument[];
  activeDocumentId: string;
  onSelectDocument: (id: string) => void;
  canCreateDoc: boolean;
  onOpenConvertModal: () => void;
  currentUser: { name: string; role: string } | null;
  onLogout: () => void;
  onRestartTour: () => void;
}

export default function WorkspaceNav({
  activeWorkspaceId,
  onSelectWorkspace,
  onOpenWorkspaceSettings,
  searchTerm,
  onSearchTermChange,
  documents,
  activeDocumentId,
  onSelectDocument,
  canCreateDoc,
  onOpenConvertModal,
  currentUser,
  onLogout,
  onRestartTour,
}: WorkspaceNavProps) {
  const filteredDocuments = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="dr-nav">
      <div className="dr-nav-brand">
        <div className="dr-nav-brand-mark">VC</div>
        <div>
          <p className="dr-nav-brand-title">Viscollab</p>
          <span className="dr-nav-brand-sub">WORKSPACE</span>
        </div>
      </div>

      <div className="dr-nav-section">
        <WorkspaceSelector
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={onSelectWorkspace}
          onOpenSettings={onOpenWorkspaceSettings}
        />
      </div>

      <div className="dr-nav-section">
        <input
          type="text"
          placeholder="Search documents..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          className="dr-nav-search"
        />
      </div>

      <div className="dr-nav-doclist">
        <div className="dr-nav-doclist-header">
          <span>Documents</span>
          {canCreateDoc && (
            <button
              onClick={onOpenConvertModal}
              className="dr-nav-icon-btn"
              title="Convert Document"
              data-testid="create-new-doc-btn"
            >
              <Plus size={14} />
            </button>
          )}
        </div>

        <div className="dr-nav-doclist-items">
          {filteredDocuments.map((doc) => {
            const isActive = doc.id === activeDocumentId;
            return (
              <button
                key={doc.id}
                onClick={() => onSelectDocument(doc.id)}
                className={`dr-nav-doc-row ${isActive ? "dr-nav-doc-row-active" : ""}`}
              >
                <FileText size={15} />
                <span className="dr-nav-doc-name">{doc.name}</span>
              </button>
            );
          })}
          {filteredDocuments.length === 0 && (
            <p className="dr-empty" style={{ textAlign: "center", padding: "16px 0" }}>
              No documents found
            </p>
          )}
        </div>
      </div>

      <div className="dr-nav-footer">
        {currentUser && (
          <div className="dr-nav-user">
            <div className="dr-nav-avatar">{currentUser.name[0]}</div>
            <div className="dr-nav-user-meta">
              <p className="dr-nav-user-name">{currentUser.name}</p>
              <p className="dr-nav-user-role">{currentUser.role}</p>
            </div>
            <button
              onClick={onLogout}
              className="dr-nav-icon-btn"
              title="Log Out"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}

        <button onClick={onRestartTour} className="dr-nav-tour-btn">
          <HelpCircle size={14} />
          <span>Restart Tour</span>
        </button>
      </div>
    </div>
  );
}
