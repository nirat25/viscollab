#!/usr/bin/env tsx
/**
 * Build a TipTapDoc IR fixture JSON file from a Markdown source file (SEM-004).
 *
 * Mirrors the .md ingestion path already used by
 * web/src/app/api/collab/convert/route.ts:
 *   marked.parse(markdown) -> HTML -> ingestRawHtml(html, sourceFile) -> TipTapDoc
 *
 * Usage:
 *   npx tsx scripts/build-fixture-ir.ts <input.md> <output.json> [sourceFileLabel]
 *
 * The output JSON is committed as a test fixture under
 * app/tests/fixtures/semantic/*.ir.json — do not hand-edit it, regenerate with
 * this script instead.
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname, basename, resolve } from "node:path";
import { marked } from "marked";
import { ingestRawHtml } from "../src/ingest/index.js";

const [, , inputArg, outputArg, sourceFileArg] = process.argv;

if (!inputArg || !outputArg) {
  console.error("Usage: npx tsx scripts/build-fixture-ir.ts <input.md> <output.json> [sourceFileLabel]");
  process.exit(1);
}

const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);
const sourceFile = sourceFileArg ?? basename(inputPath);

const mdText = await readFile(inputPath, "utf8");
const html = await marked.parse(mdText);
const ir = ingestRawHtml(html, sourceFile);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(ir, null, 2) + "\n", "utf8");

console.log(`Wrote ${outputPath} (sourceFile: ${sourceFile}, ${ir.content.length} top-level blocks)`);
