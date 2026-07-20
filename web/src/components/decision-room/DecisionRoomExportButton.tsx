"use client";

import { useState } from "react";
import type { DocumentStateV2 } from "htmlcollab-app/persistence";

export interface DecisionRoomExportButtonProps {
  documentId: string;
  expectedRevision: number;
  onState?: (state: DocumentStateV2) => void;
  onRevision?: (revision: number) => void;
  onAccessLost?: () => void;
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  const match = header?.match(/filename="?([^";]+)"?/i);
  return match?.[1]?.replace(/[^A-Za-z0-9._-]/g, "_") || fallback;
}

/** Downloads the server-generated attachment; nothing from client room state is exported. */
export default function DecisionRoomExportButton({ documentId, expectedRevision, onState, onRevision, onAccessLost }: DecisionRoomExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");

  const exportRoom = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setError("");
    try {
      const response = await fetch("/api/collab/export", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, expectedRevision }),
      });
      if (response.status === 401 || response.status === 403) onAccessLost?.();
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Unable to export this room right now.";
        throw new Error(message);
      }
      const blob = await response.blob();
      const revision = Number(response.headers.get("X-Room-Revision"));
      if (Number.isInteger(revision) && revision >= 0) onRevision?.(revision);
      const stateHeader = response.headers.get("X-Room-State");
      if (stateHeader) {
        try {
          const state = JSON.parse(stateHeader) as unknown;
          if (state && typeof state === "object" && (state as { schemaVersion?: unknown }).schemaVersion === 2) onState?.(state as DocumentStateV2);
        } catch { /* export bytes are still valid; stale state will refresh on the next read */ }
      }
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filenameFromDisposition(response.headers.get("Content-Disposition"), `decision-room-${documentId}.json`);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 0);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export this room right now.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="dr-export-control">
      <button type="button" className="dr-canvas-topline-btn" onClick={exportRoom} disabled={isExporting}>
        {isExporting ? "Exporting…" : "Export room data"}
      </button>
      {error && <p className="dr-export-error" role="alert">{error}</p>}
    </div>
  );
}
