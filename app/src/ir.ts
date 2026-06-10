/**
 * Production Intermediate Representation (IR) for HTMLCollab.
 *
 * TipTap/ProseMirror-compatible JSON AST. This is the canonical form produced
 * by the ingestion layer (P2-T1) and consumed by the conversion pipeline (P2-T2).
 *
 * Design notes:
 *  - Mirrors TipTap's document schema so nodes can be injected into the editor
 *    without a separate parse step.
 *  - `attrs` is always an object (even if empty) for consistency.
 *  - `marks` carries inline styling (bold, italic, link, code).
 *  - The spike's flat `Block[]` model is superseded by this tree.
 */

// ── Marks (inline) ──────────────────────────────────────────────────────────

export interface BoldMark    { type: "bold" }
export interface ItalicMark  { type: "italic" }
export interface CodeMark    { type: "code" }
export interface LinkMark    { type: "link"; attrs: { href: string; title?: string } }

export type Mark = BoldMark | ItalicMark | CodeMark | LinkMark;

// ── Leaf nodes ───────────────────────────────────────────────────────────────

export interface TextNode {
  type: "text";
  text: string;
  marks?: Mark[];
}

export interface HardBreakNode {
  type: "hardBreak";
}

// ── Block nodes ──────────────────────────────────────────────────────────────

export interface HeadingNode {
  type: "heading";
  attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 };
  content: (TextNode | HardBreakNode)[];
}

export interface ParagraphNode {
  type: "paragraph";
  attrs: Record<string, never>;
  content: (TextNode | HardBreakNode)[];
}

export interface BulletListNode {
  type: "bulletList";
  attrs: Record<string, never>;
  content: ListItemNode[];
}

export interface OrderedListNode {
  type: "orderedList";
  attrs: { start: number };
  content: ListItemNode[];
}

export interface ListItemNode {
  type: "listItem";
  attrs: Record<string, never>;
  /** Each list item contains one or more block nodes */
  content: (ParagraphNode | BulletListNode | OrderedListNode)[];
}

export interface TableNode {
  type: "table";
  attrs: Record<string, never>;
  content: TableRowNode[];
}

export interface TableRowNode {
  type: "tableRow";
  attrs: Record<string, never>;
  content: (TableHeaderNode | TableCellNode)[];
}

export interface TableHeaderNode {
  type: "tableHeader";
  attrs: Record<string, never>;
  content: ParagraphNode[];
}

export interface TableCellNode {
  type: "tableCell";
  attrs: Record<string, never>;
  content: ParagraphNode[];
}

export interface ImageNode {
  type: "image";
  attrs: { src: string; alt: string; title?: string };
}

/** Union of all block-level nodes */
export type BlockNode =
  | HeadingNode
  | ParagraphNode
  | BulletListNode
  | OrderedListNode
  | TableNode
  | ImageNode;

// ── Document root ────────────────────────────────────────────────────────────

export interface TipTapDoc {
  type: "doc";
  /** The source filename, preserved for LLM context. */
  sourceFile: string;
  /** docType is always "auto" — the LLM judges the document type, not us. */
  docType: "auto";
  content: BlockNode[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Internal recursive text extractor — accepts any IR node shape via duck-typing. */
function _extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;

  // Text leaf
  if (n["type"] === "text" && typeof n["text"] === "string") return n["text"];

  // Image
  if (n["type"] === "image") {
    const attrs = n["attrs"] as { alt?: string } | undefined;
    return `[image: ${attrs?.alt ?? ""}]`;
  }

  // Document root
  if (n["type"] === "doc" && Array.isArray(n["content"])) {
    return (n["content"] as unknown[]).map(_extractText).join("\n").trim();
  }

  // Heading — prefix with # markers
  if (n["type"] === "heading" && Array.isArray(n["content"])) {
    const attrs = n["attrs"] as { level?: number } | undefined;
    const level = attrs?.level ?? 1;
    const prefix = "#".repeat(level) + " ";
    return prefix + (n["content"] as unknown[]).map(_extractText).join("");
  }

  // Table row — join cells with " | "
  if (n["type"] === "tableRow" && Array.isArray(n["content"])) {
    return (n["content"] as unknown[])
      .map((cell) => {
        const c = cell as Record<string, unknown>;
        return Array.isArray(c["content"])
          ? (c["content"] as unknown[]).map(_extractText).join("")
          : "";
      })
      .join(" | ");
  }

  // Everything else with content[] — join with newline
  if (Array.isArray(n["content"])) {
    return (n["content"] as unknown[]).map(_extractText).join("\n");
  }

  return "";
}

/** Materialise the text content of a node tree (recursive). Used by the eval judge. */
export function nodeToPlainText(node: TipTapDoc | BlockNode | ListItemNode): string {
  return _extractText(node);
}

/** Quick structural summary for tests / debug logging. */
export function irSummary(doc: TipTapDoc): string {
  const counts: Record<string, number> = {};
  for (const node of doc.content) {
    counts[node.type] = (counts[node.type] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([k, v]) => `${k}×${v}`)
    .join(", ");
}
