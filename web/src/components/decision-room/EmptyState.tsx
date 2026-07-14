"use client";

/**
 * EmptyState (ROOM-004) — shown when the active workspace has zero documents.
 * Copy is EXACT per brief §10 vocabulary: "Import your first strategy memo."
 */

import { Sparkles } from "lucide-react";
import "@/app/decision-room.css";

export interface EmptyStateProps {
  onImport: () => void;
}

export default function EmptyState({ onImport }: EmptyStateProps) {
  return (
    <div className="dr-empty-state">
      <div className="dr-empty-state-icon">
        <Sparkles size={20} />
      </div>
      <p className="dr-empty-state-copy">Import your first strategy memo.</p>
      <button
        type="button"
        onClick={onImport}
        className="dr-empty-state-cta"
        data-testid="empty-state-import-btn"
      >
        Import document
      </button>
    </div>
  );
}
