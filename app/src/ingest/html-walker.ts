/**
 * Shared HTML → TipTap IR walker.
 *
 * Both the .docx path (mammoth → semantic HTML → IR) and the GDoc paste path
 * (GDoc clipboard HTML → sanitize → IR) share this core traversal logic.
 * Each caller is responsible for pre-sanitizing its HTML before passing it here.
 */

import { parse as parseHtml, type HTMLElement, type Node } from "node-html-parser";
import type {
  BlockNode,
  BulletListNode,
  HeadingNode,
  ImageNode,
  ListItemNode,
  Mark,
  OrderedListNode,
  ParagraphNode,
  TableCellNode,
  TableHeaderNode,
  TableNode,
  TableRowNode,
  TextNode,
  TipTapDoc,
} from "../ir.js";

/** Walk an HTMLElement's children, collecting inline content (text + marks). */
function inlineContent(el: HTMLElement, inheritedMarks: Mark[] = []): TextNode[] {
  const nodes: TextNode[] = [];

  const walk = (node: Node, marks: Mark[]) => {
    // Text node — use `.text` (not `.rawText`): node-html-parser decodes HTML
    // entities (&amp;, &#39;, &quot;, …) via `he` only on the `.text` accessor.
    // The IR must hold the true text, not markup-encoded text.
    if (node.nodeType === 3) {
      const text = node.text;
      if (text) nodes.push({ type: "text", text, ...(marks.length ? { marks } : {}) });
      return;
    }
    const e = node as HTMLElement;
    const tag = e.tagName?.toLowerCase() ?? "";
    let childMarks = [...marks];
    if (tag === "strong" || tag === "b") childMarks.push({ type: "bold" });
    if (tag === "em" || tag === "i")    childMarks.push({ type: "italic" });
    if (tag === "code")                 childMarks.push({ type: "code" });
    if (tag === "a") {
      const href = e.getAttribute("href") ?? "";
      if (href) childMarks.push({ type: "link", attrs: { href } });
    }
    for (const child of e.childNodes) walk(child, childMarks);
  };

  walk(el, inheritedMarks);
  return nodes;
}

function makeParagraph(el: HTMLElement): ParagraphNode {
  return { type: "paragraph", attrs: {}, content: inlineContent(el) };
}

function makeHeading(el: HTMLElement, level: 1 | 2 | 3 | 4 | 5 | 6): HeadingNode {
  return { type: "heading", attrs: { level }, content: inlineContent(el) };
}

function makeListItem(el: HTMLElement): ListItemNode {
  // A list item may contain nested lists. Walk children manually.
  const content: ListItemNode["content"] = [];
  // Collect inline nodes into a paragraph, nested lists as sub-lists.
  let pendingInline: TextNode[] = [];

  const flushInline = () => {
    if (pendingInline.length) {
      content.push({ type: "paragraph", attrs: {}, content: pendingInline });
      pendingInline = [];
    }
  };

  for (const child of el.childNodes) {
    // Direct text-node child: emit just that node's (entity-decoded) text.
    // (Previously this branch re-walked the ENTIRE <li> via inlineContent(el),
    // duplicating formatted siblings for items like `- **Label**: rest`.)
    if (child.nodeType === 3) {
      const text = child.text;
      // Keep whitespace-only runs only between inline content (they separate
      // adjacent inline elements); drop leading/pretty-printing whitespace.
      if (text && (text.trim() !== "" || pendingInline.length > 0)) {
        pendingInline.push({ type: "text", text });
      }
      continue;
    }
    const e = child as HTMLElement;
    const tag = e.tagName?.toLowerCase() ?? "";
    if (tag === "ul") {
      flushInline();
      content.push(makeList(e, false) as BulletListNode);
    } else if (tag === "ol") {
      flushInline();
      content.push(makeList(e, true) as OrderedListNode);
    } else {
      pendingInline.push(...inlineContent(e));
    }
  }
  flushInline();
  if (!content.length) content.push({ type: "paragraph", attrs: {}, content: [] });
  return { type: "listItem", attrs: {}, content };
}

function makeList(el: HTMLElement, ordered: boolean): BulletListNode | OrderedListNode {
  const items = el
    .querySelectorAll("li")
    .filter((li) => li.parentNode === el) // only direct children
    .map(makeListItem);
  if (ordered) {
    const start = parseInt(el.getAttribute("start") ?? "1", 10);
    return { type: "orderedList", attrs: { start: isNaN(start) ? 1 : start }, content: items };
  }
  return { type: "bulletList", attrs: {}, content: items };
}

function makeTable(el: HTMLElement): TableNode {
  const rows: TableRowNode[] = [];
  for (const tr of el.querySelectorAll("tr")) {
    const cells: (TableHeaderNode | TableCellNode)[] = [];
    for (const cell of tr.querySelectorAll("th,td")) {
      const tag = cell.tagName?.toLowerCase();
      const para: ParagraphNode = { type: "paragraph", attrs: {}, content: inlineContent(cell) };
      if (tag === "th") {
        cells.push({ type: "tableHeader", attrs: {}, content: [para] });
      } else {
        cells.push({ type: "tableCell", attrs: {}, content: [para] });
      }
    }
    if (cells.length) rows.push({ type: "tableRow", attrs: {}, content: cells });
  }
  return { type: "table", attrs: {}, content: rows };
}

/** Walk top-level block elements and convert to TipTap IR nodes. */
export function htmlToTipTapBlocks(html: string): BlockNode[] {
  const root = parseHtml(html);
  const blocks: BlockNode[] = [];

  for (const node of root.childNodes) {
    const el = node as HTMLElement;
    if (el.nodeType !== 1) continue; // skip text/comment nodes at root
    const tag = el.tagName?.toLowerCase() ?? "";

    const hm = /^h([1-6])$/.exec(tag);
    if (hm) {
      blocks.push(makeHeading(el, Number(hm[1]) as 1 | 2 | 3 | 4 | 5 | 6));
      continue;
    }

    if (tag === "p") {
      // paragraph may contain an inline <img>
      const img = el.querySelector("img");
      if (img) {
        blocks.push({
          type: "image",
          attrs: {
            src: img.getAttribute("src") ?? "",
            alt: img.getAttribute("alt") ?? "",
            title: img.getAttribute("title") ?? undefined,
          },
        } satisfies ImageNode);
      }
      const inline = inlineContent(el);
      if (inline.length) blocks.push({ type: "paragraph", attrs: {}, content: inline });
      continue;
    }

    if (tag === "ul") { blocks.push(makeList(el, false)); continue; }
    if (tag === "ol") { blocks.push(makeList(el, true));  continue; }
    if (tag === "table") { blocks.push(makeTable(el)); continue; }

    if (tag === "img") {
      blocks.push({
        type: "image",
        attrs: {
          src: el.getAttribute("src") ?? "",
          alt: el.getAttribute("alt") ?? "",
          title: el.getAttribute("title") ?? undefined,
        },
      } satisfies ImageNode);
      continue;
    }

    // Treat unknown block tags (div, section, article, …) as paragraphs
    const text = el.text.trim();
    if (text) blocks.push(makeParagraph(el));
  }

  return blocks;
}

/** Build a TipTapDoc from a clean semantic HTML string and source metadata. */
export function semanticHtmlToDoc(
  cleanHtml: string,
  sourceFile: string
): TipTapDoc {
  let content: BlockNode[] = [];
  try {
    content = htmlToTipTapBlocks(cleanHtml);
  } catch (err) {
    throw new Error(`AST mapping failed for ${sourceFile}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    type: "doc",
    sourceFile,
    docType: "auto",
    content,
  };
}
