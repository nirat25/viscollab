"use client";

import React from "react";
import { Sparkles, MessageSquare, Lock, Unlock } from "lucide-react";
import { motion } from "framer-motion";

export interface SectionToolbarProps {
  sectionId: string;
  title: string;
  /** Offset (px) from the top of the scroll container to the section's top. */
  top: number;
  canEdit: boolean;
  canComment: boolean;
  isDraft: boolean;
  isLocked: boolean;
  onAiEdit: (sectionId: string) => void;
  onComment: (sectionId: string) => void;
  onToggleLock: (sectionId: string) => void;
  /** Lets the owner clear hover state when the pointer leaves the toolbar. */
  onMouseLeave?: (e: React.MouseEvent) => void;
}

/**
 * A small floating toolbar pinned to the top-right of the hovered section.
 *
 * Intentionally light: it does NOT repaint the whole section. The faint gutter
 * cue is handled with pure CSS (.vc-section-hover) toggled imperatively on the
 * hovered element by DocumentSurface — no React re-render per mousemove.
 */
export default function SectionToolbar({
  sectionId,
  title,
  top,
  canEdit,
  canComment,
  isDraft,
  isLocked,
  onAiEdit,
  onComment,
  onToggleLock,
  onMouseLeave,
}: SectionToolbarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      data-section-toolbar={sectionId}
      onMouseLeave={onMouseLeave}
      className="absolute right-4 md:right-6 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-indigo-100/50 dark:border-slate-800/50 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-2xl p-1.5 z-40 flex items-center gap-2 ring-1 ring-white/20"
      style={{ top: top + 6 }}
    >
      <div className="flex items-center gap-1 border-r border-slate-200/50 dark:border-slate-700/50 pr-2 pl-1.5">
        <span
          className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest truncate max-w-[80px] xs:max-w-[100px] sm:max-w-[140px]"
          title={title || sectionId}
        >
          {title || sectionId}
        </span>
      </div>

      <div className="flex gap-1.5">
        {canEdit && isDraft && (
          <>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onToggleLock(sectionId)}
              className={`flex items-center justify-center p-1.5 rounded-xl transition-colors shadow-sm border cursor-pointer ${
                isLocked 
                  ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-700/50" 
                  : "bg-slate-100/50 text-slate-500 border-slate-200/50 hover:bg-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700/50 dark:hover:bg-slate-700"
              }`}
              title={isLocked ? "Unlock section" : "Lock section from regeneration"}
            >
              {isLocked ? <Lock className="h-3.5 w-3.5 shrink-0" /> : <Unlock className="h-3.5 w-3.5 shrink-0" />}
            </motion.button>
            {!isLocked && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onAiEdit(sectionId)}
                data-testid={`ai-edit-btn-${sectionId}`}
                className="flex items-center gap-1.5 py-1.5 px-3 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-600 dark:text-indigo-400 hover:text-white rounded-xl text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer shadow-sm"
                title="Surgical AI Edit"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span>AI Edit</span>
              </motion.button>
            )}
          </>
        )}
        {canComment && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onComment(sectionId)}
            data-testid={`comment-btn-${sectionId}`}
            className="flex items-center gap-1.5 py-1.5 px-3 bg-slate-100/50 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-[11px] font-bold transition-colors border border-slate-200/50 dark:border-slate-700/50 whitespace-nowrap cursor-pointer shadow-sm"
            title="Comment on section"
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
            <span>Comment</span>
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
