/**
 * /preview/visual (VISUI-010) — dev-only visual QA route. Renders EVERY
 * web/src/components/visual/* component standalone (not through TipTap)
 * against the founder golden fixture + `planVisuals`, one labeled section per
 * component, so each can be judged in isolation.
 *
 * Same dev-only fs fixture access pattern as /preview/canvas (see the note
 * there): the `htmlcollab-app` package `exports` map does not expose
 * `app/tests/fixtures/*`, so this server component reads the founder golden
 * directly from disk. Fine for a dev-only preview route; do not depend on
 * this path from production code.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SemanticArtifact } from "htmlcollab-app/semantic";
import VisualPreviewClient from "./VisualPreviewClient";

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

export default async function VisualPreviewPage() {
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

  return <VisualPreviewClient artifact={artifact} />;
}
