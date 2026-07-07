import React, { useState, useEffect } from "react";
import { Folder, Plus, Settings, ChevronDown, Crown, Users } from "lucide-react";
import { useSession } from "next-auth/react";

interface Workspace {
  id: string;
  name: string;
  createdBy?: string;
  members: { username: string; role: string }[];
}

interface WorkspaceSelectorProps {
  activeWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onOpenSettings: () => void;
}

export default function WorkspaceSelector({ activeWorkspaceId, onSelectWorkspace, onOpenSettings }: WorkspaceSelectorProps) {
  const { data: session } = useSession();
  const currentUsername = (session?.user as any)?.name ?? "";

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  useEffect(() => {
    if (currentUsername) fetchWorkspaces();
  }, [currentUsername]);

  const fetchWorkspaces = async () => {
    try {
      const res = await fetch("/api/collab/workspaces");
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data);
        if (!activeWorkspaceId && data.length > 0) {
          onSelectWorkspace(data[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    try {
      const res = await fetch("/api/collab/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWorkspaceName })
      });
      if (res.ok) {
        const newWs = await res.json();
        setWorkspaces([...workspaces, newWs]);
        onSelectWorkspace(newWs.id);
        setIsCreating(false);
        setNewWorkspaceName("");
        setIsOpen(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getUserRoleInWorkspace = (ws: Workspace): string => {
    if (!currentUsername) return "viewer";
    const member = ws.members.find(
      (m) => m.username.toLowerCase() === currentUsername.toLowerCase()
    );
    return member?.role ?? "viewer";
  };

  const isOwnerOrAdmin = (role: string) => ["owner", "admin"].includes(role);

  const myWorkspaces = workspaces.filter((ws) => isOwnerOrAdmin(getUserRoleInWorkspace(ws)));
  const invitedWorkspaces = workspaces.filter((ws) => !isOwnerOrAdmin(getUserRoleInWorkspace(ws)));

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeRole = activeWorkspace ? getUserRoleInWorkspace(activeWorkspace) : null;

  const WorkspaceButton = ({ ws }: { ws: Workspace }) => {
    const role = getUserRoleInWorkspace(ws);
    const isActive = activeWorkspaceId === ws.id;
    return (
      <button
        key={ws.id}
        onClick={() => {
          onSelectWorkspace(ws.id);
          setIsOpen(false);
        }}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 group ${
          isActive ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-700"
        }`}
      >
        <Folder className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate flex-1">{ws.name}</span>
        {isOwnerOrAdmin(role) && (
          <Crown className={`h-3 w-3 shrink-0 ${isActive ? "text-indigo-200" : "text-amber-400 opacity-70"}`} />
        )}
      </button>
    );
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <Folder className="h-4 w-4 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-sm font-semibold text-slate-200 truncate block">
              {activeWorkspace ? activeWorkspace.name : "Select Workspace"}
            </span>
            {activeRole && (
              <span className="text-[10px] text-slate-500 capitalize">{activeRole}</span>
            )}
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="max-h-72 overflow-y-auto">

              {/* My Workspaces */}
              {myWorkspaces.length > 0 && (
                <div className="p-2">
                  <p className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                    <Crown className="h-3 w-3" />
                    My Workspaces
                  </p>
                  <div className="space-y-0.5 mt-1">
                    {myWorkspaces.map((ws) => <WorkspaceButton key={ws.id} ws={ws} />)}
                  </div>
                </div>
              )}

              {/* Invited To */}
              {invitedWorkspaces.length > 0 && (
                <div className={`p-2 ${myWorkspaces.length > 0 ? "border-t border-slate-700" : ""}`}>
                  <p className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <Users className="h-3 w-3" />
                    Invited To
                  </p>
                  <div className="space-y-0.5 mt-1">
                    {invitedWorkspaces.map((ws) => <WorkspaceButton key={ws.id} ws={ws} />)}
                  </div>
                </div>
              )}

              {workspaces.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-500">No workspaces yet</div>
              )}
            </div>

            {/* Footer actions */}
            <div className="border-t border-slate-700 p-2 space-y-1 bg-slate-800/80">
              {isCreating ? (
                <form onSubmit={handleCreateWorkspace} className="flex gap-2">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Workspace name..."
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    className="flex-1 px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg font-semibold hover:bg-indigo-700 cursor-pointer"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="px-2 py-1.5 text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  New Workspace
                </button>
              )}

              {activeWorkspace && isOwnerOrAdmin(activeRole ?? "") && (
                <button
                  onClick={() => {
                    onOpenSettings();
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Settings className="h-4 w-4" />
                  Workspace Settings
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
