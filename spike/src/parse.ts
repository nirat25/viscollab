import { readFile } from "node:fs/promises";
import { extname, basename } from "node:path";
import mammoth from "mammoth";
import { parse as parseHtml, HTMLElement } from "node-html-parser";
import type { Block, DocIR, Section } from "./ir.ts";

// Lightweight markdown -> IR. Headings, ordered/unordered lists, pipe tables,
// paragraphs. Sufficient for the fidelity spike; not a full CommonMark parser.
export function markdownToIR(md: string, sourceFile: string): DocIR {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const sections: Section[] = [];
  let current: Section = { heading: "", level: 0, blocks: [] };
  let title = "";

  let i = 0;
  const flushSection = () => {
    if (current.heading || current.blocks.length) sections.push(current);
  };

  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isDivider = (l: string) => /^\s*\|?[-:\s|]+\|?\s*$/.test(l) && l.includes("-");

  while (i < lines.length) {
    const line = lines[i];
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushSection();
      const level = heading[1].length;
      const text = heading[2].trim();
      if (level === 1 && !title) title = text;
      current = { heading: text, level, blocks: [] };
      i++;
      continue;
    }

    // table: header row + divider + body rows
    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const splitRow = (l: string) =>
        l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      current.blocks.push({ type: "table", headers, rows });
      continue;
    }

    // list block
    const listMatch = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push(m[2].trim());
        i++;
      }
      current.blocks.push({ type: "list", ordered, items });
      continue;
    }

    // image
    const img = /^!\[([^\]]*)\]\(([^)]*)\)\s*$/.exec(line.trim());
    if (img) {
      current.blocks.push({ type: "image", alt: img[1] });
      i++;
      continue;
    }

    // blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // paragraph: accumulate until blank / structural line
    const para: string[] = [line.trim()];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) &&
      !isTableRow(lines[i])
    ) {
      para.push(lines[i].trim());
      i++;
    }
    current.blocks.push({ type: "paragraph", text: para.join(" ") } satisfies Block);
  }
  flushSection();

  if (!title) title = basename(sourceFile).replace(/\.[^.]+$/, "");

  return { title, sections, meta: { sourceFile: basename(sourceFile), docType: "auto" } };
}

// HTML (mammoth output for .docx) -> IR. mammoth emits semantic HTML:
// h1-h6, p, ul/ol/li, table, img.
export function htmlToIR(html: string, sourceFile: string): DocIR {
  const root = parseHtml(html);
  const sections: Section[] = [];
  let current: Section = { heading: "", level: 0, blocks: [] };
  let title = "";
  const flush = () => {
    if (current.heading || current.blocks.length) sections.push(current);
  };

  const cellText = (el: HTMLElement) => el.text.trim();

  for (const el of root.childNodes.filter((n): n is HTMLElement => n instanceof HTMLElement)) {
    const tag = el.tagName?.toLowerCase() ?? "";
    const h = /^h([1-6])$/.exec(tag);
    if (h) {
      flush();
      const level = Number(h[1]);
      const text = el.text.trim();
      if (level === 1 && !title) title = text;
      current = { heading: text, level, blocks: [] };
    } else if (tag === "p") {
      const img = el.querySelector("img");
      if (img) current.blocks.push({ type: "image", alt: img.getAttribute("alt") ?? "" });
      const text = el.text.trim();
      if (text) current.blocks.push({ type: "paragraph", text });
    } else if (tag === "ul" || tag === "ol") {
      const items = el.querySelectorAll("li").map((li) => li.text.trim()).filter(Boolean);
      if (items.length) current.blocks.push({ type: "list", ordered: tag === "ol", items });
    } else if (tag === "table") {
      const rows = el.querySelectorAll("tr");
      if (rows.length) {
        const headers = rows[0].querySelectorAll("th,td").map(cellText);
        const body = rows.slice(1).map((r) => r.querySelectorAll("td,th").map(cellText));
        current.blocks.push({ type: "table", headers, rows: body });
      }
    } else if (tag === "img") {
      current.blocks.push({ type: "image", alt: el.getAttribute("alt") ?? "" });
    }
  }
  flush();
  if (!title) title = basename(sourceFile).replace(/\.[^.]+$/, "");
  return { title, sections, meta: { sourceFile: basename(sourceFile), docType: "auto" } };
}

export async function parseToIR(filePath: string): Promise<DocIR> {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".docx") {
    const { value } = await mammoth.convertToHtml({ path: filePath });
    return htmlToIR(value, filePath);
  }
  if (ext === ".md" || ext === ".markdown" || ext === ".txt") {
    const md = await readFile(filePath, "utf8");
    return markdownToIR(md, filePath);
  }
  throw new Error(`Unsupported input type: ${ext}. Use .docx, .md, or .txt.`);
}
