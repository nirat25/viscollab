#!/usr/bin/env tsx
/**
 * Debug CLI for semantic extraction (SEM-006 debug output).
 *
 * Usage:
 *   npm run extract -- <input.md|.html> [--mock] [--out <file.json>]
 *
 * Ingests the document (same path as the web convert route), runs semantic
 * extraction (REAL LLM via role "extract" unless --mock), then prints:
 *   - the extracted SemanticArtifact JSON
 *   - schema validation result
 *   - sourceTrace resolution stats (resolved refs / total)
 *
 * Real mode needs app/.env (ANTHROPIC_API_KEY or the OpenAI-compatible block).
 * Mirrors scripts/convert.ts conventions.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { ingestRawHtml } from "../src/ingest/index.js";
import { nodeToPlainText } from "../src/ir.js";
import { extractSemantic } from "../src/semantic/extract.js";
import { mockExtract } from "../src/semantic/mock.js";
import { validateSemanticArtifact } from "../src/semantic/schema.js";
import { validateSourceTrace } from "../src/semantic/sourceTrace.js";
import { providerInfo } from "../src/convert/client.js";

// Load app/.env (gitignored) into process.env — same pattern as scripts/convert.ts.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

const args = process.argv.slice(2);
const useMock = args.includes("--mock");
const outIdx = args.indexOf("--out");
const outPath = outIdx !== -1 ? args[outIdx + 1] : undefined;
const inputArg = args.find((a, i) => !a.startsWith("--") && (outIdx === -1 || i !== outIdx + 1));

if (!inputArg) {
  console.error("Usage: npm run extract -- <input.md|.html> [--mock] [--out <file.json>]");
  process.exit(1);
}

const inputPath = resolve(inputArg);
const sourceFile = basename(inputPath);
const rawText = await readFile(inputPath, "utf8");
const html = extname(inputPath).toLowerCase() === ".html" ? rawText : await marked.parse(rawText);
const ir = ingestRawHtml(html, sourceFile);

console.error(`Ingested ${sourceFile}: ${ir.content.length} top-level blocks`);
console.error(useMock ? "Extractor: MOCK (deterministic)" : `Extractor: LLM — ${providerInfo()}`);

const started = Date.now();
const artifact = useMock ? mockExtract(ir) : await extractSemantic(ir);
const elapsedMs = Date.now() - started;

const schema = validateSemanticArtifact(artifact);
const trace = validateSourceTrace(artifact, ir);
const allRefs = artifact.nodes.flatMap((n) => n.sourceRefs);
const resolvedRefs = allRefs.filter((r) => r.charStart !== undefined && r.charEnd !== undefined);

const byKind = new Map<string, number>();
for (const n of artifact.nodes) byKind.set(n.kind, (byKind.get(n.kind) ?? 0) + 1);

console.log(JSON.stringify(artifact, null, 2));
console.error("");
console.error(`— extracted in ${(elapsedMs / 1000).toFixed(1)}s by ${artifact.extractedBy}`);
console.error(`— nodes: ${artifact.nodes.length} (${[...byKind.entries()].map(([k, v]) => `${k}:${v}`).join(", ")})`);
console.error(`— schema: ${schema.valid ? "VALID" : `INVALID — ${schema.errors.join("; ")}`}`);
console.error(`— sourceTrace: ${resolvedRefs.length}/${allRefs.length} refs resolved to char spans; ${trace.valid ? "all quotes found in source" : `PROBLEMS — ${trace.errors.join("; ")}`}`);
console.error(`— source plain text: ${nodeToPlainText(ir).length} chars`);

if (outPath) {
  await writeFile(resolve(outPath), JSON.stringify(artifact, null, 2) + "\n", "utf8");
  console.error(`— wrote ${resolve(outPath)}`);
}

if (!schema.valid) process.exit(2);
