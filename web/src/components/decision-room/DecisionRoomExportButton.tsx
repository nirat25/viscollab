"use client";

import { useState } from "react";

export interface DecisionRoomExportButtonProps {
  documentId: string;
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  const match = header?.match(/filename="?([^";]+)"?/i);
  return match?.[1]?.replace(/[^A-Za-z0-9._-]/g, "_") || fallback;
}

/** Downloads the server-generated attachment; nothing from client room state is exported. */
export default function DecisionRoomExportButton({ documentId }: DecisionRoomExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");

  const exportRoom = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setError("");
    try {
      const response = await fetch(`/api/collab/export?documentId=${encodeURIComponent(documentId)}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Unable to export this room right now.";
        throw new Error(message);
      }
      const blob = await response.blob();
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
