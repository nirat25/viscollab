import { writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseToIR } from "./parse.ts";
import { convert } from "./convert.ts";
import { validateContract } from "./template.ts";
import { runEval, computeGate } from "./harness.ts";
import { providerInfo } from "./client.ts";
import { judgeStructure } from "./judge-structure.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, "out");

// Load spike/.env (gitignored) into process.env. Drop your API key there once;
// no need to re-export it each shell session. Client reads keys lazily at call time.
const envPath = join(ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const [cmd, arg] = process.argv.slice(2);

async function convertOne(file: string) {
  const ir = await parseToIR(file);
  console.log(`[convert] parsed "${ir.title}" — ${ir.sections.length} sections`);
  const { html, promptVersion, model } = await convert(ir);
  const contract = validateContract(html);
  await mkdir(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, basename(file, extname(file)) + ".html");
  await writeFile(outPath, html, "utf8");
  console.log(`[convert] ${model} / ${promptVersion} -> ${outPath}`);
  console.log(`[convert] contract: ${contract.valid ? "OK" : "FAIL — " + contract.errors.join("; ")}`);
}

async function validateOne(file: string) {
  // validate-only on an existing HTML file (deterministic, no API key needed)
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(file, "utf8");
  const r = validateContract(html);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.valid ? 0 : 1);
}

async function evalAll() {
  console.log(`[eval] provider: ${providerInfo()}`);
  const results = await runEval();
  const gate = computeGate(results);
  console.log("\n=== GATE REPORT ===");
  for (const [id, g] of Object.entries(gate.gradedPassRates)) {
    console.log(`  ${id}: ${g.passed}/${g.total} (${(g.rate * 100).toFixed(0)}%) ${g.meets ? "OK" : "BELOW 80%"}`);
  }
  if (gate.zeroToleranceFailures.length) {
    console.log("  ZERO-TOLERANCE FAILURES:");
    for (const f of gate.zeroToleranceFailures) console.log(`    ${f.file} / ${f.criterion}: ${f.reason}`);
  } else {
    console.log("  zero-tolerance: clean");
  }
  if (gate.contractFailures.length) console.log(`  contract failures: ${gate.contractFailures.join(", ")}`);
  console.log(`\n  GATE: ${gate.gatePassed ? "PASS" : "FAIL"}`);
  console.log("  (A failed gate is a HARD STOP per PRD §12A — escalate, do not proceed to Phase 2.)");
  process.exit(gate.gatePassed ? 0 : 1);
}

async function evalStructureAll() {
  const { readdir, readFile } = await import("node:fs/promises");
  console.log(`[eval-structure] provider: ${providerInfo()}`);

  if (!existsSync(OUT_DIR)) {
    console.log(`[eval-structure] No output directory found at ${OUT_DIR}. Run 'npm run eval' first.`);
    process.exit(1);
  }

  const entries = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".html"));
  if (entries.length === 0) {
    console.log(`[eval-structure] No HTML files found in ${OUT_DIR}. Run 'npm run eval' first.`);
    process.exit(1);
  }

  for (const file of entries) {
    const html = await readFile(join(OUT_DIR, file), "utf8");
    console.log(`\n[eval-structure] judging ${file}...`);
    try {
      const result = await judgeStructure(html);
      for (const s of result.scores) {
        console.log(`  ${s.pass ? "PASS" : "FAIL"}  ${s.id}: ${s.reason}`);
      }
    } catch (e) {
      console.log(`  ERROR: ${(e as Error).message}`);
    }
  }
}

try {
  switch (cmd) {
    case "convert":
      if (!arg) throw new Error("usage: npm run convert -- <path-to-doc>");
      await convertOne(arg);
      break;
    case "validate":
      if (!arg) throw new Error("usage: npm run validate -- <path-to-html>");
      await validateOne(arg);
      break;
    case "eval":
      await evalAll();
      break;
    case "eval-structure":
      await evalStructureAll();
      break;
    default:
      console.log("commands: convert <doc> | eval | eval-structure | validate <html>");
  }
} catch (e) {
  console.error(`[error] ${(e as Error).message}`);
  process.exit(1);
}
