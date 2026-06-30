"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Loader2, Check, XCircle } from "lucide-react";
import DiffMatchPatch from "diff-match-patch";

export interface SurgicalEditSandboxProps {
  sectionId: string;
  originalHtml: string;
  isOpen: boolean;
  onClose: () => void;
  onCommit: (newHtml: string) => void;
}

export default function SurgicalEditSandbox({
  sectionId,
  originalHtml,
  isOpen,
  onClose,
  onCommit,
}: SurgicalEditSandboxProps) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [newHtml, setNewHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/collab/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, prompt, originalHtml }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate edit");
      }

      const data = await res.json();
      setNewHtml(data.newHtml);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAccept = () => {
    if (newHtml) {
      onCommit(newHtml);
      onClose();
    }
  };

  const handleReject = () => {
    setNewHtml(null);
    setPrompt("");
  };

  const renderDiff = () => {
    if (!newHtml) return null;
    const dmp = new DiffMatchPatch();
    const diffs = dmp.diff_main(originalHtml, newHtml);
    dmp.diff_cleanupSemantic(diffs);

    return (
      <div className="text-sm font-mono whitespace-pre-wrap break-words bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 max-h-64 overflow-y-auto">
        {diffs.map((part, index) => {
          const type = part[0];
          const text = part[1];
          if (type === 1) {
            // insertion
            return (
              <span key={index} className="bg-emerald-200/50 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200">
                {text}
              </span>
            );
          }
          if (type === -1) {
            // deletion
            return (
              <span key={index} className="bg-rose-200/50 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200 line-through">
                {text}
              </span>
            );
          }
          // unchanged
          return (
            <span key={index} className="text-slate-600 dark:text-slate-400">
              {text}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="bg-purple-100 dark:bg-purple-900/50 p-1.5 rounded-lg">
                  <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                  Surgical Edit
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-6">
              {!newHtml ? (
                <>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      Context (Section: {sectionId})
                    </label>
                    <div className="text-sm bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 max-h-40 overflow-y-auto text-slate-700 dark:text-slate-300 opacity-70">
                      <div dangerouslySetInnerHTML={{ __html: originalHtml }} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      Instructions
                    </label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g. Make this section more concise and professional..."
                      className="w-full min-h-[100px] p-4 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all outline-none resize-none text-slate-800 dark:text-slate-200"
                    />
                  </div>

                  {error && (
                    <div className="text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 p-3 rounded-lg border border-rose-100 dark:border-rose-900/50">
                      {error}
                    </div>
                  )}

                  <div className="flex justify-end gap-3 mt-2">
                    <button
                      onClick={onClose}
                      className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={isGenerating || !prompt.trim()}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Generate Edit
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center justify-between">
                      <span>Diff Preview</span>
                      <span className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-md">
                        Review Changes
                      </span>
                    </label>
                    {renderDiff()}
                  </div>

                  <div className="flex justify-end gap-3 mt-4">
                    <button
                      onClick={handleReject}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-xl transition-colors border border-rose-100 dark:border-rose-900/50"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      onClick={handleAccept}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-sm"
                    >
                      <Check className="w-4 h-4" />
                      Accept Edit
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
