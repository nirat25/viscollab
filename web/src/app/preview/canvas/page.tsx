/**
 * /preview/canvas (TIP-005) — dev-only decision-room canvas preview.
 *
 * FIXTURE ACCESS — option (a), per rebuild-status.md reviewer note: the
 * `htmlcollab-app` package `exports` map does NOT expose `app/tests/fixtures/*`,
 * so this server component reads the founder golden directly from disk. This is
 * fine for a dev-only preview route but WILL NOT exist in a deployed bundle —
 * do not depend on this path from production code. Phase 6's real convert-route
 * wiring uses `runSemanticPipeline` / the mock registry instead.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SemanticArtifact } from "htmlcollab-app/semantic";
import CanvasPreview from "@/components/tiptap/CanvasPreview";

// Always render at request time in dev (re-reads the fixture; no build-time bake).
export const dynamic = "force-dynamic";

const FIXTURE = join(
  process.cwd(),
  "..",
  "app",
  "tests",
  "fixtures",
  "semantic",
  "founder-memo.artifact.json"
);

export default async function CanvasPreviewPage() {
  let artifact: SemanticArtifact | null = null;
  let error: string | null = null;
  try {
    artifact = JSON.parse(await readFile(FIXTURE, "utf8")) as SemanticArtifact;
  } catch (e) {
    error = `Could not read founder golden fixture at ${FIXTURE}: ${
      e instanceof Error ? e.message : String(e)
    }`;
  }

  if (!artifact) {
    return (
      <main style={{ padding: 24, color: "#991b1b", fontFamily: "ui-monospace, monospace" }}>
        {error}
      </main>
    );
  }

  return <CanvasPreview artifact={artifact} />;
}
