"use client";

/**
 * SemanticArtifactEditor (TIP-002) — the read-only decision-room canvas.
 *
 * Consumes the COMPILED projection from `htmlcollab-app/visual`
 * (`projectArtifact`) — projection logic is NEVER duplicated in web (brief §0,
 * §7.1). Registers the 8 custom atom nodes, runs a fully read-only TipTap
 * editor (`editable:false` + `contenteditable=false`), and provides
 * SemanticArtifactContext so NodeViews resolve block/node data by id.
 *
 * xyflow CSS is imported once here so Phase 5 graph NodeViews inherit styles.
 */

import { EditorContent, useEditor, type Content, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useMemo, type CSSProperties, type ReactNode } from "react";
import type { SemanticArtifact } from "htmlcollab-app/semantic";
import { projectArtifact, type VisualPlan } from "htmlcollab-app/visual";
import { SemanticArtifactProvider } from "./SemanticArtifactContext";
import { visualBlockNodes } from "./nodes";
// (xyflow's base stylesheet is imported by MindMapView/ArgumentMapView
// themselves, so every host of those components gets it — review SF#1.)

const canvasStyle: CSSProperties = {
  background: "#f8fafc",
  color: "#0f172a",
  padding: "8px 16px",
  borderRadius: 12,
};

export interface SemanticArtifactEditorProps {
  artifact: SemanticArtifact;
  plan: VisualPlan;
  /** Optional dev/debug footer (e.g. round-trip probe). Client-only. */
  renderFooter?: (editor: Editor | null) => ReactNode;
}

export default function SemanticArtifactEditor({
  artifact,
  plan,
  renderFooter,
}: SemanticArtifactEditorProps) {
  "use no memo";
  // React Compiler is ON (next.config.ts `reactCompiler: true`). The TIP-001
  // gate proved read-only `useEditor` works WITHOUT this directive, but TipTap
  // officially recommends opting the `useEditor` host out of the compiler: the
  // editor instance mutates in place while its reference stays stable, so
  // compiler memoization can serve a stale editor once anything reads editor
  // state reactively (Phase 5/6 interactivity — brief risk R1). Opting out here
  // is strictly more conservative (plain React) and future-proofs that work.
  const doc = useMemo(() => projectArtifact(artifact, plan), [artifact, plan]);

  const editor = useEditor(
    {
      editable: false,
      immediatelyRender: false,
      extensions: [
        // Atoms-only doc — disable every rich-text/editing extension. Keep
        // document/paragraph/text as the base schema. `trailingNode:false` is
        // REQUIRED: it would append an empty paragraph and break the round-trip.
        StarterKit.configure({
          undoRedo: false,
          trailingNode: false,
          heading: false,
          bold: false,
          italic: false,
          strike: false,
          code: false,
          codeBlock: false,
          blockquote: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          horizontalRule: false,
          hardBreak: false,
          link: false,
          dropcursor: false,
          gapcursor: false,
          underline: false,
        }),
        ...visualBlockNodes,
      ],
      content: doc as unknown as Content,
      editorProps: {
        attributes: {
          contenteditable: "false",
          class: "semantic-artifact-canvas",
        },
      },
    },
    [doc]
  );

  return (
    <SemanticArtifactProvider artifact={artifact} plan={plan}>
      <div style={canvasStyle}>
        <EditorContent editor={editor} />
      </div>
      {renderFooter ? renderFooter(editor) : null}
    </SemanticArtifactProvider>
  );
}
