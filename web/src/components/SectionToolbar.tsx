"use client";

import React from "react";
import { Sparkles, MessageSquare } from "lucide-react";

export interface SectionToolbarProps {
  sectionId: string;
  title: string;
  /** Offset (px) from the top of the scroll container to the section's top. */
  top: number;
  canEdit: boolean;
  canComment: boolean;
  isDraft: boolean;
  onAiEdit: (sectionId: string) => void;
  onComment: (sectionId: string) => void;
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
  onAiEdit,
  onComment,
  onMouseLeave,
}: SectionToolbarProps) {
  return (
    <div
      data-section-toolbar={sectionId}
      onMouseLeave={onMouseLeave}
      className="absolute right-4 md:right-6 bg-white/95 backdrop-blur-md border border-indigo-100 shadow-lg rounded-xl p-1 z-40 flex items-center gap-1.5 ring-1 ring-indigo-500/20 animate-toolbar-fade-in"
      style={{ top: top + 6 }}
    >
      <div className="flex items-center gap-1 border-r border-slate-150 pr-1.5 pl-1">
        <span
          className="text-[9px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 px-1.5 py-0.5 rounded-md truncate max-w-[80px] xs:max-w-[100px] sm:max-w-[140px]"
          title={title || sectionId}
        >
          {title || sectionId}
        </span>
      </div>

      <div className="flex gap-1">
        {canEdit && isDraft && (
          <button
            onClick={() => onAiEdit(sectionId)}
            data-testid={`ai-edit-btn-${sectionId}`}
            className="flex items-center gap-1.5 py-1 px-2.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg text-[10px] font-bold transition-all whitespace-nowrap cursor-pointer"
            title="Surgical AI Edit"
          >
            <Sparkles className="h-3 w-3 shrink-0" />
            <span>AI Edit</span>
          </button>
        )}
        {canComment && (
          <button
            onClick={() => onComment(sectionId)}
            data-testid={`comment-btn-${sectionId}`}
            className="flex items-center gap-1 py-1 px-2.5 bg-slate-50 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition-all border border-slate-200/50 whitespace-nowrap cursor-pointer"
            title="Comment on section"
          >
            <MessageSquare className="h-3 w-3 shrink-0" />
            <span>Comment</span>
          </button>
        )}
      </div>
    </div>
  );
}
