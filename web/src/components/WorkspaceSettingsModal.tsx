import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Users, UserPlus, Loader2, Shield } from "lucide-react";

interface WorkspaceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string | null;
}

export default function WorkspaceSettingsModal({ isOpen, onClose, workspaceId }: WorkspaceSettingsModalProps) {
  const [members, setMembers] = useState<{username: string, role: string}[]>([]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [mounted, setMounted] = useState(false);
  const [canManageWorkspace, setCanManageWorkspace] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isOpen && workspaceId) {
      fetchWorkspaceDetails();
      setSuccessMsg("");
      setError("");
    }
  }, [isOpen, workspaceId]);

  const fetchWorkspaceDetails = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/collab/workspaces?workspaceId=${workspaceId}`);
      const data = await res.json();
      if (res.ok) {
        setWorkspaceName(data.name || "");
        setMembers(data.members || []);
        setCanManageWorkspace(Boolean(data.capabilities?.includes("workspace.member_manage")));
      } else {
        setError(data.error || "Failed to fetch workspaces");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred fetching workspaces");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUsername.trim() || !workspaceId) return;
    
    setIsInviting(true);
    setError("");
    setSuccessMsg("");
    
    try {
      const res = await fetch("/api/collab/workspaces/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: inviteUsername.trim(), workspaceId })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setSuccessMsg("User invited to workspace successfully");
        setInviteUsername("");
        await fetchWorkspaceDetails(); // Refresh the list
      } else {
        setError(data.error || "Failed to invite user");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred sending the invite");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemove = async (username: string) => {
    if (!workspaceId) return;
    
    setError("");
    setSuccessMsg("");
    
    try {
      const res = await fetch("/api/collab/workspaces/remove", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, workspaceId })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setSuccessMsg(`User ${username} removed successfully`);
        await fetchWorkspaceDetails(); // Refresh the list
      } else {
        setError(data.error || "Failed to remove user");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred removing the user");
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <SettingsIcon className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">{workspaceName} Settings</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Invite Section — only visible to owners/admins */}
          {canManageWorkspace && (
          <section>
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-slate-400" />
              Invite to Workspace
            </h3>
            
            <form onSubmit={handleInvite} className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Username"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  required
                />
                <button
                  type="submit"
                  disabled={isInviting || !inviteUsername.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite"}
                </button>
              </div>
              
              {error && <p className="text-sm text-rose-500 font-medium">{error}</p>}
              {successMsg && <p className="text-sm text-emerald-600 font-medium">{successMsg}</p>}
            </form>
          </section>
          )}

          {/* Members List */}
          <section>
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-400" />
              Workspace Members
            </h3>
            
            <div className="border border-slate-200/60 rounded-xl overflow-hidden">
              {isLoading ? (
                <div className="p-8 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                </div>
              ) : members.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No members found.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {members.map((member, idx) => (
                    <li key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold uppercase">
                          {member.username.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{member.username}</p>
                          <p className="text-xs text-slate-500 capitalize">{member.role}</p>
                        </div>
                      </div>
                      {canManageWorkspace && (
                      <button
                        onClick={() => handleRemove(member.username)}
                        title="Remove member"
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>,
    document.body
  );
}

function SettingsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
