"use client";

/**
 * TIP-001 compat smoke (dev-only). Proves TipTap 3 + @xyflow/react render under
 * React 19.2 + Next 16 (webpack) + the React Compiler BEFORE any feature code.
 *
 * (a) a read-only `useEditor` with StarterKit
 * (b) a bare <ReactFlow/> imported via `next/dynamic { ssr: false }` (xyflow
 *     touches `window`, so it must never server-render)
 *
 * Not linked from the app; reachable at /preview/compat in dev only.
 */

import dynamic from "next/dynamic";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import "@xyflow/react/dist/style.css";

// xyflow accesses `window`; ssr:false keeps it out of the server render.
const ReactFlow = dynamic(
  () => import("@xyflow/react").then((m) => m.ReactFlow),
  { ssr: false }
);

export default function CompatSmoke() {
  const editor = useEditor({
    editable: false,
    extensions: [StarterKit],
    content: "<p>ok</p>",
    immediatelyRender: false,
  });

  return (
    <div style={{ padding: 24, color: "#0f172a", background: "#f8fafc" }}>
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>TIP-001 compat smoke</h1>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600 }}>(a) TipTap read-only editor</h2>
        <div
          data-testid="tiptap-smoke"
          style={{
            marginTop: 8,
            padding: 12,
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600 }}>(b) bare ReactFlow (ssr:false)</h2>
        <div
          data-testid="xyflow-smoke"
          style={{
            marginTop: 8,
            height: 160,
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
          }}
        >
          <ReactFlow nodes={[]} edges={[]} fitView />
        </div>
      </section>

      <p data-testid="smoke-ready" style={{ marginTop: 16, fontSize: 13, color: "#334155" }}>
        Smoke mounted: editor {editor ? "ready" : "null"}.
      </p>
    </div>
  );
}
