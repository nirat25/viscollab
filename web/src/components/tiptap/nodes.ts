/**
 * Custom TipTap block nodes (TIP-003) — one atom node per visual block kind.
 *
 * Node names come from `VISUAL_TIPTAP_NODE_NAMES` (the single shared source in
 * `htmlcollab-app/visual`) so app projection and web schema cannot drift — never
 * string literals here (brief §7.1, R3).
 *
 * Each node is an atom (no content): `attrs` hold IDS ONLY
 * (`blockId`/`blockKind`/`primaryNodeId`); the NodeView resolves full data from
 * SemanticArtifactContext. parseHTML/renderHTML map attrs to `data-*` so the
 * doc also serializes to/from HTML losslessly, and `addNodeView` renders the
 * shared React NodeView.
 */

import { Node, ReactNodeViewRenderer, mergeAttributes } from "@tiptap/react";
import { VISUAL_TIPTAP_NODE_NAMES } from "htmlcollab-app/visual";
import VisualBlockNodeView from "./VisualBlockNodeView";

/** attrs are ids-only; `blockKind` defaults to the kind this node was built for. */
function idAttributes(blockKind: string) {
  return {
    blockId: {
      default: null as string | null,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-visual-block-id"),
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.blockId ? { "data-visual-block-id": String(attrs.blockId) } : {},
    },
    blockKind: {
      default: blockKind as string | null,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-block-kind"),
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.blockKind ? { "data-block-kind": String(attrs.blockKind) } : {},
    },
    primaryNodeId: {
      default: null as string | null,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-primary-node-id"),
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.primaryNodeId
          ? { "data-primary-node-id": String(attrs.primaryNodeId) }
          : {},
    },
  };
}

function makeVisualBlockNode(nodeName: string, blockKind: string) {
  return Node.create({
    name: nodeName,
    group: "block",
    atom: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      return idAttributes(blockKind);
    },

    parseHTML() {
      return [{ tag: `div[data-block-kind="${blockKind}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-visual-block": "",
          "data-block-kind": blockKind,
        }),
      ];
    },

    addNodeView() {
      return ReactNodeViewRenderer(VisualBlockNodeView);
    },
  });
}

/** The 8 custom nodes, in the fixed name-map order (brief §7.1). */
export const visualBlockNodes = Object.entries(VISUAL_TIPTAP_NODE_NAMES).map(
  ([blockKind, nodeName]) => makeVisualBlockNode(nodeName, blockKind)
);
