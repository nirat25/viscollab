import React, { useState, useEffect } from "react";
import { X, Users, UserPlus, Loader2, Shield } from "lucide-react";

interface TeamSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TeamSettingsModal({ isOpen, onClose }: TeamSettingsModalProps) {
  const [members, setMembers] = useState<{username: string, role: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteRole, setInviteRole] = useState("collaborator");
  const [isInviting, setIsInviting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
      setSuccessMsg("");
      setError("");
    }
  }, [isOpen]);

  const fetchMembers = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/team/members");
      const data = await res.json();
      if (res.ok && data.success) {
        setMembers(data.members || []);
      } else {
        setError(data.error || "Failed to fetch members");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred fetching members");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUsername.trim()) return;
    
    setIsInviting(true);
    setError("");
    setSuccessMsg("");
    
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: inviteUsername.trim(), role: inviteRole })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setSuccessMsg(data.message || "User invited successfully");
        setInviteUsername("");
        setInviteRole("collaborator");
        await fetchMembers(); // Refresh the list
      } else {
        setError(data.error || "Failed to invite user");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred sending the invite");
    } finally {
      setIsInviting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Team Settings</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Invite Section */}
          <section>
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-slate-400" />
              Invite Teammate
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
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="owner">Owner</option>
                  <option value="collaborator">Collaborator</option>
                  <option value="commenter">Commenter</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  type="submit"
                  disabled={isInviting || !inviteUsername.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Invite"}
                </button>
              </div>
              
              {error && <p className="text-sm text-rose-500 font-medium">{error}</p>}
              {successMsg && <p className="text-sm text-emerald-600 font-medium">{successMsg}</p>}
            </form>
          </section>

          {/* Members List */}
          <section>
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-400" />
              Existing Members
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
                      
                      {member.role === 'owner' && (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-semibold uppercase tracking-wider">
                          Owner
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
