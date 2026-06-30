import React from "react";
import { Plus, X, Send, Check } from "lucide-react";
import { type Comment } from "htmlcollab-app/collab";

interface CommentSidebarProps {
  tourStep: number | null;
  isAddingComment: boolean;
  setIsAddingComment: (val: boolean) => void;
  selectedText: string;
  handleAddComment: (e: React.FormEvent) => void;
  commentText: string;
  setCommentText: (val: string) => void;
  commentFeedbackType: "approve" | "flag" | "needs" | "question" | null;
  setCommentFeedbackType: (val: "approve" | "flag" | "needs" | "question" | null) => void;
  comments: Comment[];
  selectedCommentId: string | null;
  setSelectedCommentId: (val: string | null) => void;
  replyDrafts: Record<string, string>;
  setReplyDrafts: (val: React.SetStateAction<Record<string, string>>) => void;
  handleAddReply: (e: React.FormEvent, commentId: string) => void;
  currentUser: { name: string; role: string } | null;
  handleResolveComment: (commentId: string) => void;
}

export default function CommentSidebar({
  tourStep, isAddingComment, setIsAddingComment, selectedText,
  handleAddComment, commentText, setCommentText, commentFeedbackType,
  setCommentFeedbackType, comments, selectedCommentId, setSelectedCommentId,
  replyDrafts, setReplyDrafts, handleAddReply, currentUser, handleResolveComment
}: CommentSidebarProps) {
  return (
        <aside 
          id="tour-right-collab"
          className={`pane-right-sidebar transition-all border-l border-slate-200/60 pl-6 ${
            tourStep === 3 ? "ring-4 ring-indigo-500 ring-offset-2 z-50 animate-pulse" : ""
          }`}
        >
          <div className="pane-right-sidebar-scroll flex flex-col gap-6">
          
          {/* Add Comment card modal inline */}
          {isAddingComment && (
            <div className="bg-slate-900/80 backdrop-blur-xl border border-indigo-500/30 p-5 rounded-2xl shadow-xl animate-fade-in space-y-4 ring-1 ring-indigo-500/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                  <Plus className="h-4 w-4" />
                  New Comment
                </span>
                <button onClick={() => setIsAddingComment(false)} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {selectedText && (
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/50 text-xs text-slate-300 leading-snug border-l-2 border-l-indigo-500/50 shadow-inner">
                  <span className="font-bold block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 font-display">Highlighted context</span>
                  <div className="italic truncate">"{selectedText}"</div>
                </div>
              )}

              <form onSubmit={handleAddComment} className="space-y-3">
                <div>
                  <textarea
                    required
                    data-testid="comment-body-input"
                    className="w-full p-3 bg-slate-800/80 border border-slate-700/50 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none placeholder-slate-500 font-sans text-slate-200 shadow-inner"
                    placeholder="Type your comment... Use @name for mentions"
                    rows={3}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <select
                    data-testid="comment-feedback-type"
                    value={commentFeedbackType || ""}
                    onChange={(e) => setCommentFeedbackType(e.target.value as any || null)}
                    className="flex-1 text-xs bg-slate-900 border border-slate-700/50 text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">General (No Badge)</option>
                    <option value="question">❓ Question</option>
                    <option value="approve">🟢 Approval</option>
                    <option value="flag">🚩 Flag risk</option>
                    <option value="needs">📋 Needs Data</option>
                  </select>
                  <button
                    type="submit"
                    data-testid="comment-submit-button"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-4 rounded-lg text-xs font-semibold transition-colors shadow-sm cursor-pointer"
                  >
                    Post
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Comments Panel */}
          <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800 shadow-xl flex flex-col flex-1 overflow-hidden min-h-[450px]">
            {/* Sidebar Tab Area */}
            <div className="p-5 flex-1 overflow-y-auto max-h-[500px]">
              
              {/* Tab 1: Threads */}
              <div className="space-y-4">
                {comments.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-xs">
                      No discussion threads active.
                    </div>
                  ) : (
                    comments.map((comment) => (
                      <div
                        key={comment.id}
                        id={`sidebar-comment-${comment.id}`}
                        data-testid="comment-item"
                        className={`p-4 rounded-xl border transition-all cursor-pointer ${
                          selectedCommentId === comment.id 
                            ? "bg-slate-800/80 border-indigo-500/50 ring-1 ring-indigo-500/50 shadow-md" 
                            : "bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-600/50"
                        }`}
                        onClick={() => setSelectedCommentId(comment.id)}
                      >
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-200">{comment.author}</span>
                            <span className="text-[10px] text-slate-500 font-medium">
                              {new Date(comment.createdAt).toLocaleTimeString([], {hour: "2-digit", minute:"2-digit"})}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Feedback badges */}
                            {comment.feedbackType === "needs" && (
                              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">Needs Data</span>
                            )}
                            {comment.feedbackType === "flag" && (
                              <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">Risk</span>
                            )}
                            {comment.feedbackType === "approve" && (
                              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">Approved</span>
                            )}
                            {comment.feedbackType === "question" && (
                              <span className="bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">Question</span>
                            )}
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                              comment.lifecycle === "resolved" ? "bg-slate-700/50 text-slate-400 border-slate-600/50" : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                            }`}>
                              {comment.lifecycle}
                            </span>
                          </div>
                        </div>

                        {comment.target.type === "text" && (
                          <div className="text-[11px] text-slate-400 italic bg-slate-900/50 p-2 rounded-lg border border-slate-700/50 mb-3 truncate border-l-2 border-l-indigo-500/50">
                            "{comment.target.quote}"
                          </div>
                        )}

                        <p className="text-sm text-slate-300 leading-relaxed font-sans">{comment.body}</p>

                        {/* Replies */}
                        {comment.replies.length > 0 && (
                          <div className="mt-4 pl-3 border-l-2 border-slate-700 space-y-3">
                            {comment.replies.map((reply: any) => (
                              <div key={reply.id} className="text-sm">
                                <div className="flex items-center gap-2 text-[10px] mb-1">
                                  <span className="font-bold text-slate-200">{reply.author}</span>
                                  <span className="text-slate-500 font-medium">
                                    {new Date(reply.ts).toLocaleTimeString([], {hour: "2-digit", minute:"2-digit"})}
                                  </span>
                                </div>
                                <p className="text-slate-400 font-sans leading-relaxed text-xs">{reply.body}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Reply Form */}
                        {selectedCommentId === comment.id && (
                          <div className="mt-4 pt-3 border-t border-slate-700/50 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                            <form onSubmit={(e) => handleAddReply(e, comment.id)} className="flex items-center gap-2">
                              <input
                                type="text"
                                className="flex-1 p-2 bg-slate-900 border border-slate-700/50 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans text-slate-200 placeholder-slate-500 shadow-inner"
                                placeholder="Type reply..."
                                value={replyDrafts[comment.id] || ""}
                                onChange={(e) => setReplyDrafts(prev => ({ ...prev, [comment.id]: e.target.value }))}
                              />
                              <button
                                type="submit"
                                className="p-2.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/20 rounded-xl transition-colors cursor-pointer"
                              >
                                <Send className="h-3.5 w-3.5" />
                              </button>
                            </form>

                            {/* Resolve status button */}
                            {currentUser && currentUser.role !== "viewer" && (
                              <button
                                onClick={() => handleResolveComment(comment.id)}
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold self-start flex items-center gap-1.5 cursor-pointer bg-indigo-500/5 px-2 py-1 rounded-md"
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
            </div>
          </div>
          </div> {/* Closing pane-right-sidebar-scroll */}
        </aside>
  );
}
