"use client";

import React from "react";
import { MessageSquare } from "lucide-react";

export interface SelectionCommentPillProps {
  /** Page coordinates (already including scroll offsets) for the pill. */
  left: number;
  top: number;
  onClick: () => void;
}

/**
 * A floating "Comment" pill that appears just below a non-collapsed text
 * selection inside the artifact. Clicking it opens the composer pre-filled with
 * the selected quote. Dismissal (Esc / click-away / selection change) is owned
 * by DocumentSurface.
 */
export default function SelectionCommentPill({
  left,
  top,
  onClick,
}: SelectionCommentPillProps) {
  return (
    <button
      data-testid="selection-comment-pill"
      // Prevent the mousedown from collapsing the active selection before onClick fires.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="fixed z-[60] flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg ring-2 ring-white cursor-pointer animate-toolbar-fade-in"
      style={{ left, top }}
    >
      <MessageSquare className="h-3.5 w-3.5" />
      <span>Comment</span>
    </button>
  );
}
