"use client";

/**
 * RoundTripProbe (TIP-005) — in-browser serialization check.
 *
 * Web has no unit-test runner (brief C4); the deterministic round-trip test
 * lives in the app vitest suite (`app/tests/visual/plan.test.ts`). This probe is
 * the browser-visible complement: it mounts the editor, reads `editor.getJSON()`
 * back out, and asserts it deep-equals the projected input doc — so the
 * orchestrator can verify losslessness on the preview route with no runner.
 */

import { useEffect, useState, type CSSProperties } from "react";
import type { Editor } from "@tiptap/react";
import type { SemanticArtifact } from "htmlcollab-app/semantic";
import {
  projectArtifact,
  VISUAL_TIPTAP_NODE_NAMES,
  type VisualPlan,
} from "htmlcollab-app/visual";

/** Deterministic canonical JSON (sorted object keys) for order-independent compare. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

const VALID_NAMES = new Set<string>(Object.values(VISUAL_TIPTAP_NODE_NAMES));

export default function RoundTripProbe({
  editor,
  artifact,
  plan,
}: {
  editor: Editor | null;
  artifact: SemanticArtifact;
  plan: VisualPlan;
}) {
  const [result, setResult] = useState<{
    pass: boolean;
    detail: string;
  } | null>(null);

  useEffect(() => {
    if (!editor) return;
    const expected = projectArtifact(artifact, plan);
    const actual = editor.getJSON() as {
      content?: Array<{ type?: string }>;
    };
    const names = (actual.content ?? []).map((n) => n.type ?? "");
    const badNames = names.filter((n) => !VALID_NAMES.has(n));
    const eq =
      JSON.stringify(canonical(expected)) === JSON.stringify(canonical(actual));

    if (eq && badNames.length === 0) {
      setResult({
        pass: true,
        detail: `PASS — ${expected.content.length} blocks (${names.join(", ")})`,
      });
    } else {
      setResult({
        pass: false,
        detail: badNamesToDetail(badNames, expected.content.length, names.length),
      });
    }
  }, [editor, artifact, plan]);

  const base: CSSProperties = {
    margin: "12px 0",
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    border: "1px solid #e2e8f0",
  };
  if (!result) {
    return (
      <p data-testid="roundtrip" style={{ ...base, color: "#64748b", background: "#f8fafc" }}>
        Round-trip: measuring…
      </p>
    );
  }
  return (
    <p
      data-testid="roundtrip"
      data-roundtrip={result.pass ? "pass" : "fail"}
      style={{
        ...base,
        color: result.pass ? "#166534" : "#991b1b",
        background: result.pass ? "#f0fdf4" : "#fef2f2",
        borderColor: result.pass ? "#bbf7d0" : "#fecaca",
      }}
    >
      Round-trip: {result.detail}
    </p>
  );
}

function badNamesToDetail(bad: string[], expected: number, actual: number): string {
  if (bad.length) return `FAIL — unknown node names: ${bad.join(", ")}`;
  return `FAIL — block count/attrs differ (expected ${expected}, got ${actual})`;
}
