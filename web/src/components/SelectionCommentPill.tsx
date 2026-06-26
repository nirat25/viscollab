"use client";

import React from "react";
import { MessageSquare } from "lucide-react";
import { motion } from "framer-motion";

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
    <motion.button
      initial={{ opacity: 0, y: 10, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      data-testid="selection-comment-pill"
      // Prevent the mousedown from collapsing the active selection before onClick fires.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="fixed z-[60] flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-4 ring-white/50 dark:ring-slate-900/50 cursor-pointer"
      style={{ left, top }}
    >
      <MessageSquare className="h-3.5 w-3.5" />
      <span>Comment</span>
    </motion.button>
  );
}
