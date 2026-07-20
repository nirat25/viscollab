import React, { useState } from "react";
import { List, FileText, MessageSquare, LogOut, Users } from "lucide-react";
import TeamSettingsModal from "./TeamSettingsModal";
import type { DocumentStateV2 } from "htmlcollab-app/persistence";

interface HeaderProps {
  setIsSidebarOpen: (isOpen: boolean) => void;
  documents: { id: string; title: string }[];
  activeDocumentId: string | null;
  documentVersions: { versionNumber: number; html: string; status: "Draft" | "Live"; timestamp: string }[];
  activeVersionNum: number;
  setActiveVersionNum: (num: number) => void;
  currentUser: { name: string; role: "owner" | "collaborator" | "commenter" | "viewer" } | null;
  setIsConvertModalOpen: (isOpen: boolean) => void;
  isCommentsOpen: boolean;
  setIsCommentsOpen: (isOpen: boolean) => void;
  handleLogout: () => void;
  activeWorkspaceId: string | null;
  isSemanticRoom: boolean;
  roomRevision: number | null;
  onRoomState: (state: DocumentStateV2) => void;
  onAccessLost: () => void;
}

export default function Header({
  setIsSidebarOpen, documents, activeDocumentId, documentVersions,
  activeVersionNum, setActiveVersionNum, currentUser, setIsConvertModalOpen,
  isCommentsOpen, setIsCommentsOpen, handleLogout, activeWorkspaceId, isSemanticRoom,
  roomRevision, onRoomState, onAccessLost,
}: HeaderProps) {
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);

  if (!currentUser) return null;
  return (
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-1.5 -ml-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              title="Open Workspace Explorer"
            >
              <List className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight font-display text-slate-900 flex items-center gap-2 truncate">
                <FileText className="h-4.5 w-4.5 text-indigo-600 shrink-0" />
                <span className="truncate">{documents.find((d) => d.id === activeDocumentId)?.title || "Loading Document..."}</span>
              </h1>
              <p className="hidden sm:block text-[10px] text-indigo-600 font-semibold uppercase tracking-wider">Active Workspace Document</p>
            </div>
          </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Version Selector */}
          <div className="flex items-center gap-1 sm:gap-2 bg-slate-100 rounded-xl p-1.5 border border-slate-200/50">
            <span className="hidden sm:inline text-xs font-bold text-slate-500 px-2">Version:</span>
            <select
              value={activeVersionNum}
              onChange={(e) => setActiveVersionNum(Number(e.target.value))}
              className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2 sm:px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
              title="Convert Document"
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-1.5 px-2.5 sm:px-3 rounded-xl text-xs transition-colors shadow-sm cursor-pointer"
            >
              <span aria-hidden="true">✨</span>
              <span className="hidden sm:inline">Convert Document</span>
            </button>
          )}

          {/* Team Settings Action */}
          {currentUser && currentUser.role === "owner" && (
            <button
              onClick={() => setIsTeamModalOpen(true)}
              data-testid="team-settings-button"
              title="Team Settings"
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-1.5 px-2.5 sm:px-3 rounded-xl text-xs transition-colors shadow-sm cursor-pointer border border-slate-200/50"
            >
              <Users className="h-4 w-4" /> <span className="hidden sm:inline">Team Settings</span>
            </button>
          )}

          {/* Current User Badge */}
          <div className="flex items-center gap-2.5 bg-slate-50 px-2 sm:px-3.5 py-1.5 rounded-xl border border-slate-200/60 shadow-sm">
            <div className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold uppercase shrink-0">
              {currentUser.name[0]}
            </div>
            <div className="hidden sm:block text-left leading-none">
              <p className="text-xs font-semibold text-slate-800">{currentUser.name}</p>
              <p className="text-[10px] font-medium text-slate-400 capitalize">{currentUser.role}</p>
            </div>
          </div>

          <button
            onClick={() => setIsCommentsOpen(!isCommentsOpen)}
            aria-expanded={isCommentsOpen}
            aria-controls="tour-right-collab"
            className={`p-2 rounded-xl border transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${isCommentsOpen ? "bg-slate-800 text-white border-slate-800 shadow-sm" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-sm"}`}
            title={isSemanticRoom ? "Toggle Review" : "Toggle Comments"}
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">{isSemanticRoom ? "Review" : "Comments"}</span>
          </button>

          <button
            onClick={handleLogout}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors border border-slate-100 cursor-pointer"
            title="Log Out"
          >
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </div>

        <TeamSettingsModal 
          isOpen={isTeamModalOpen} 
          onClose={() => setIsTeamModalOpen(false)} 
          activeDocumentId={activeDocumentId}
          activeWorkspaceId={activeWorkspaceId}
          roomRevision={roomRevision}
          onRoomState={onRoomState}
          onAccessLost={onAccessLost}
        />
      </header>
  );
}
