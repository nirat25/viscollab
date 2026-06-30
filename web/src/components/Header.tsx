import React, { useState } from "react";
import { List, FileText, MessageSquare, LogOut, Users } from "lucide-react";
import TeamSettingsModal from "./TeamSettingsModal";

interface HeaderProps {
  setIsSidebarOpen: (isOpen: boolean) => void;
  documents: { id: string; name: string; createdAt: string }[];
  activeDocumentId: string;
  documentVersions: { versionNumber: number; html: string; status: "Draft" | "Live"; timestamp: string }[];
  activeVersionNum: number;
  setActiveVersionNum: (num: number) => void;
  currentUser: { name: string; role: "owner" | "collaborator" | "commenter" | "viewer" } | null;
  setIsConvertModalOpen: (isOpen: boolean) => void;
  isCommentsOpen: boolean;
  setIsCommentsOpen: (isOpen: boolean) => void;
  handleLogout: () => void;
}

export default function Header({
  setIsSidebarOpen, documents, activeDocumentId, documentVersions,
  activeVersionNum, setActiveVersionNum, currentUser, setIsConvertModalOpen,
  isCommentsOpen, setIsCommentsOpen, handleLogout
}: HeaderProps) {
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);

  if (!currentUser) return null;
  return (
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-1.5 -ml-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Open Workspace Explorer"
            >
              <List className="h-5 w-5" />
            </button>
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

          {/* Team Settings Action */}
          {currentUser && currentUser.role === "owner" && (
            <button
              onClick={() => setIsTeamModalOpen(true)}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-1.5 px-3 rounded-xl text-xs transition-colors shadow-sm cursor-pointer border border-slate-200/50"
            >
              <Users className="h-4 w-4" /> Team Settings
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
            onClick={() => setIsCommentsOpen(!isCommentsOpen)}
            className={`p-2 rounded-xl border transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${isCommentsOpen ? "bg-slate-800 text-white border-slate-800 shadow-sm" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-sm"}`}
            title="Toggle Comments"
          >
            <MessageSquare className="h-4 w-4" />
            Comments
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
        />
      </header>
  );
}
