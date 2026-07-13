"use client";

/**
 * CanvasPreview (TIP-005) — dev-only client wrapper for /preview/canvas.
 *
 * The preview page is a server component (it reads the golden fixture from
 * disk), so it can only pass serializable props. This client wrapper receives
 * the artifact, plans the visuals, mounts the read-only editor, and attaches the
 * RoundTripProbe as the editor footer.
 */

import { planVisuals, type VisualPlan } from "htmlcollab-app/visual";
import type { SemanticArtifact } from "htmlcollab-app/semantic";
import { useMemo } from "react";
import SemanticArtifactEditor from "./SemanticArtifactEditor";
import RoundTripProbe from "./RoundTripProbe";

export default function CanvasPreview({
  artifact,
}: {
  artifact: SemanticArtifact;
}) {
  const plan: VisualPlan = useMemo(() => planVisuals(artifact), [artifact]);

  return (
    // Full-bleed light wrapper so this dev route reads calm/light end-to-end.
    // Scoped to the preview only — does NOT touch globals.css / flip the global
    // body (brief C1). Phase 5 introduces the real scoped decision-room.css.
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: 24 }}>
        <header style={{ marginBottom: 8 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: 0 }}>
            {artifact.title}
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Read-only decision-room canvas · {plan.blocks.length} planned blocks · dev preview
          </p>
        </header>

        <SemanticArtifactEditor
          artifact={artifact}
          plan={plan}
          renderFooter={(editor) => (
            <RoundTripProbe editor={editor} artifact={artifact} plan={plan} />
          )}
        />
      </div>
    </div>
  );
}
