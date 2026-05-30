import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseToIR } from "./parse.ts";
import { convert } from "./convert.ts";
import { validateContract, type ContractResult } from "./template.ts";
import { judge, type JudgeResult } from "./judge.ts";
import { THRESHOLDS, type CriterionId } from "./rubric.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GOLDEN_DIR = join(ROOT, "golden");
const RESULTS_DIR = join(ROOT, "results");
const OUT_DIR = join(ROOT, "out");

const INPUT_EXTS = new Set([".docx", ".md", ".markdown", ".txt"]);

// Optional sidecar <name>.meta.json: { "highStakes": true, "note": "buried-lede adversarial" }
interface GoldenMeta {
  highStakes?: boolean;
  note?: string;
}

export interface DocResult {
  file: string;
  highStakes: boolean;
  note?: string;
  contract: ContractResult;
  judge: JudgeResult;
  promptVersion: string;
  model: string;
}

async function loadGoldenMeta(dir: string, file: string): Promise<GoldenMeta> {
  const sidecar = join(dir, basename(file, extname(file)) + ".meta.json");
  if (existsSync(sidecar)) {
    try {
      return JSON.parse(await readFile(sidecar, "utf8")) as GoldenMeta;
    } catch {
      return {};
    }
  }
  return {};
}

export async function runEval(goldenDir = GOLDEN_DIR): Promise<DocResult[]> {
  const entries = (await readdir(goldenDir)).filter(
    (f) => INPUT_EXTS.has(extname(f).toLowerCase())
  );
  if (entries.length === 0) {
    throw new Error(
      `No golden docs found in ${goldenDir}. Drop a real .docx/.md sample there first.`
    );
  }

  const results: DocResult[] = [];
  for (const file of entries) {
    const path = join(goldenDir, file);
    const meta = await loadGoldenMeta(goldenDir, file);
    console.log(`\n[eval] ${file}${meta.highStakes ? " (high-stakes)" : ""}`);

    const ir = await parseToIR(path);
    const { html, promptVersion, model } = await convert(ir);
    const contract = validateContract(html);

    // persist the generated artifact for inspection
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(join(OUT_DIR, basename(file, extname(file)) + ".html"), html, "utf8");

    const judgeResult = await judge(ir, html);

    const dr: DocResult = {
      file,
      highStakes: !!meta.highStakes,
      note: meta.note,
      contract,
      judge: judgeResult,
      promptVersion,
      model,
    };
    results.push(dr);
    logDoc(dr);
  }

  await persistResults(results);
  return results;
}

function passOf(r: DocResult, id: CriterionId): boolean {
  return r.judge.scores.find((s) => s.id === id)?.pass ?? false;
}

function logDoc(r: DocResult) {
  console.log(`  contract: ${r.contract.valid ? "OK" : "FAIL — " + r.contract.errors.join("; ")}`);
  for (const s of r.judge.scores) {
    console.log(`  ${s.pass ? "PASS" : "FAIL"}  ${s.id}: ${s.reason}`);
  }
}

export interface GateReport {
  gradedPassRates: Record<string, { passed: number; total: number; rate: number; meets: boolean }>;
  zeroToleranceFailures: { file: string; criterion: CriterionId; reason: string }[];
  contractFailures: string[];
  gatePassed: boolean;
}

export function computeGate(results: DocResult[]): GateReport {
  const gradedPassRates: GateReport["gradedPassRates"] = {};
  for (const id of THRESHOLDS.gradedCriteria) {
    const passed = results.filter((r) => passOf(r, id)).length;
    const total = results.length;
    const rate = total ? passed / total : 0;
    gradedPassRates[id] = { passed, total, rate, meets: rate >= THRESHOLDS.gradedPassRate };
  }

  // zero-tolerance enforced on the high-stakes subset (fall back to all docs if none tagged)
  const highStakes = results.filter((r) => r.highStakes);
  const subset = highStakes.length ? highStakes : results;
  const zeroToleranceFailures: GateReport["zeroToleranceFailures"] = [];
  for (const r of subset) {
    for (const id of THRESHOLDS.zeroToleranceCriteria) {
      if (!passOf(r, id)) {
        const reason = r.judge.scores.find((s) => s.id === id)?.reason ?? "";
        zeroToleranceFailures.push({ file: r.file, criterion: id, reason });
      }
    }
  }

  const contractFailures = results.filter((r) => !r.contract.valid).map((r) => r.file);

  const gradedOk = Object.values(gradedPassRates).every((g) => g.meets);
  const gatePassed = gradedOk && zeroToleranceFailures.length === 0 && contractFailures.length === 0;

  return { gradedPassRates, zeroToleranceFailures, contractFailures, gatePassed };
}

async function persistResults(results: DocResult[]) {
  await mkdir(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const gate = computeGate(results);
  const payload = { stamp, results, gate };
  await writeFile(join(RESULTS_DIR, `eval-${stamp}.json`), JSON.stringify(payload, null, 2), "utf8");
  console.log(`\n[eval] results written to results/eval-${stamp}.json`);
}
