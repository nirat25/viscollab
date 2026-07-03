import React, { useState, useEffect } from "react";
import { Folder, Plus, Settings, ChevronDown } from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  members: any[];
}

interface WorkspaceSelectorProps {
  activeWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onOpenSettings: () => void;
}

export default function WorkspaceSelector({ activeWorkspaceId, onSelectWorkspace, onOpenSettings }: WorkspaceSelectorProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const fetchWorkspaces = async () => {
    try {
      const res = await fetch("/viscollab/api/collab/workspaces");
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
      const res = await fetch("/viscollab/api/collab/workspaces", {
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

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <Folder className="h-4 w-4 text-slate-400 shrink-0" />
          <span className="text-sm font-semibold text-slate-200 truncate">
            {activeWorkspace ? activeWorkspace.name : "Select Workspace"}
          </span>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
            {workspaces.map(ws => (
              <button
                key={ws.id}
                onClick={() => {
                  onSelectWorkspace(ws.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${activeWorkspaceId === ws.id ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
              >
                <Folder className="h-4 w-4" />
                <span className="truncate">{ws.name}</span>
              </button>
            ))}
          </div>

          <div className="border-t border-slate-700 p-2 space-y-2 bg-slate-800/50">
            {isCreating ? (
              <form onSubmit={handleCreateWorkspace} className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  placeholder="Workspace name..."
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  className="flex-1 px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                />
                <button type="submit" className="px-2 py-1 bg-indigo-600 text-white text-xs rounded font-semibold hover:bg-indigo-700 cursor-pointer">
                  Create
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
            
            {activeWorkspace && (
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
      )}
    </div>
  );
}
