/**
 * IR → LLM prompt text serialiser (P2-T2).
 *
 * Converts a TipTapDoc (P2-T1 production IR) into a clean, token-efficient
 * plain-text representation suitable for the conversion system prompt.
 *
 * Design decisions:
 *  - Inline marks are rendered as Markdown (bold = **…**, italic = _…_, code = `…`)
 *    since the LLM understands Markdown and it is more token-efficient than HTML.
 *  - Links are rendered as [text](href).
 *  - Tables are rendered as pipe tables (Markdown convention).
 *  - Lists are rendered as Markdown bullet/numbered lists with two-space nesting.
 *  - Images are represented as descriptive placeholders so the LLM knows they exist.
 */

import type {
  TipTapDoc,
  BlockNode,
  HeadingNode,
  ParagraphNode,
  BulletListNode,
  OrderedListNode,
  ListItemNode,
  TableNode,
  ImageNode,
  TextNode,
  HardBreakNode,
  Mark,
} from "../ir.js";

// ── Inline rendering ──────────────────────────────────────────────────────────

function applyMark(text: string, mark: Mark): string {
  switch (mark.type) {
    case "bold":   return `**${text}**`;
    case "italic": return `_${text}_`;
    case "code":   return `\`${text}\``;
    case "link":   return `[${text}](${mark.attrs.href})`;
  }
}

function renderInline(node: TextNode | HardBreakNode): string {
  if (node.type === "hardBreak") return "\n";
  let text = node.text;
  if (node.marks) {
    for (const mark of node.marks) {
      text = applyMark(text, mark);
    }
  }
  return text;
}

function renderInlineContent(
  content: (TextNode | HardBreakNode)[]
): string {
  return content.map(renderInline).join("");
}

// ── Block rendering ───────────────────────────────────────────────────────────

function renderHeading(node: HeadingNode): string {
  return `${"#".repeat(node.attrs.level)} ${renderInlineContent(node.content)}`;
}

function renderParagraph(node: ParagraphNode): string {
  return renderInlineContent(node.content);
}

function renderListItem(item: ListItemNode, depth: number, ordered: boolean, idx: number): string {
  const indent = "  ".repeat(depth);
  const bullet = ordered ? `${idx + 1}.` : "-";
  const lines: string[] = [];

  for (const child of item.content) {
    if (child.type === "paragraph") {
      const text = renderInlineContent(child.content);
      if (text.trim()) lines.push(`${indent}${bullet} ${text}`);
    } else if (child.type === "bulletList") {
      lines.push(renderBulletList(child, depth + 1));
    } else if (child.type === "orderedList") {
      lines.push(renderOrderedList(child, depth + 1));
    }
  }
  return lines.join("\n");
}

function renderBulletList(node: BulletListNode, depth = 0): string {
  return node.content
    .map((item, i) => renderListItem(item, depth, false, i))
    .join("\n");
}

function renderOrderedList(node: OrderedListNode, depth = 0): string {
  return node.content
    .map((item, i) => renderListItem(item, depth, true, i))
    .join("\n");
}

function renderTable(node: TableNode): string {
  const rows = node.content;
  if (!rows.length) return "";

  // Render each row as a pipe-table line
  const renderedRows = rows.map((row) =>
    "| " +
    row.content
      .map((cell) =>
        cell.content.map((p) => renderInlineContent(p.content)).join(" ")
      )
      .join(" | ") +
    " |"
  );

  // Insert a separator after the first row (treat first row as header)
  const firstRow = renderedRows[0] ?? "";
  const cols = (firstRow.match(/\|/g) ?? []).length - 1;
  const sep = "| " + Array(cols).fill("---").join(" | ") + " |";

  const [header, ...body] = renderedRows;
  return [header, sep, ...body].filter(Boolean).join("\n");
}

function renderImage(node: ImageNode): string {
  return `[Image: ${node.attrs.alt || "(no alt text)"}]`;
}

function renderBlock(node: BlockNode): string {
  switch (node.type) {
    case "heading":     return renderHeading(node);
    case "paragraph":   return renderParagraph(node);
    case "bulletList":  return renderBulletList(node);
    case "orderedList": return renderOrderedList(node);
    case "table":       return renderTable(node);
    case "image":       return renderImage(node);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Serialise a TipTapDoc to a token-efficient plain-text + Markdown string
 * suitable for the LLM conversion prompt.
 */
export function tipTapDocToPromptText(doc: TipTapDoc): string {
  return doc.content
    .map(renderBlock)
    .filter((s) => s.trim() !== "")
    .join("\n\n");
}
