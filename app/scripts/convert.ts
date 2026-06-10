#!/usr/bin/env tsx
/**
 * CLI wrapper for the HTMLCollab conversion pipeline (P2-T2).
 * Usage:
 *   npx tsx scripts/convert.ts <path-to-doc>
 *   npx tsx scripts/convert.ts <path-to-doc> --out <output-dir>
 *
 * Supports: .docx, .md, .txt (via docx ingestion or text-as-GDoc-html fallback)
 */

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPipeline } from "../src/pipeline.js";
import { ProgressReporter } from "../src/convert/progress.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Load app/.env (gitignored) into process.env
const envPath = join(ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const args = process.argv.slice(2);
const fileArg = args[0];
const outDirArg = args.indexOf("--out") !== -1 ? args[args.indexOf("--out") + 1] : undefined;

if (!fileArg) {
  console.error("Usage: npx tsx scripts/convert.ts <path-to-doc> [--out <output-dir>]");
  process.exit(1);
}

const inputPath = resolve(fileArg);
const outDir = outDirArg ? resolve(outDirArg) : join(ROOT, "out");
const ext = extname(inputPath).toLowerCase();

const progress = new ProgressReporter((evt) => {
  const elapsed = progress.elapsedMs();
  console.log(`[${evt.stage}] ${evt.message}${elapsed ? ` (${elapsed}ms)` : ""}`);
});

console.log(`HTMLCollab Convert — ${inputPath}`);

try {
  const result = await runPipeline(
    ext === ".docx"
      ? { kind: "docx-path", filePath: inputPath }
      : (() => { throw new Error(`Unsupported file type: ${ext}. Use .docx`); })(),
    progress
  );

  // Write output
  await mkdir(outDir, { recursive: true });
  const outFile = join(outDir, basename(inputPath, ext) + ".html");
  await writeFile(outFile, result.html, "utf8");

  console.log(`\n✅ Done (${result.elapsedMs}ms)`);
  console.log(`   Model:   ${result.model} / ${result.promptVersion}`);
  console.log(`   Output:  ${outFile}`);
  console.log(`   Contract: ${result.contract.valid ? "PASS" : "FAIL — " + result.contract.errors.join("; ")}`);
  console.log(`   Headings: ${result.contract.headingCount}   Progressive disclosure: ${result.contract.progressiveDisclosure}`);
  console.log(`   Top-level IR blocks: ${result.ir.content.length}`);
} catch (err) {
  console.error(`\n❌ ${(err as Error).message}`);
  process.exit(1);
}
