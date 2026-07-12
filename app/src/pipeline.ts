/**
 * End-to-end pipeline: ingest → convert → validate (P2-T2).
 *
 * This is the single entry point for the full document processing flow.
 * Both the CLI script and future API routes call runPipeline().
 *
 * Flow:
 *   1. Ingest: .docx (buffer or path) or GDoc HTML → TipTapDoc IR
 *   2. Convert: IR → LLM → HTML artifact
 *   3. Validate: structural contract check
 *   4. Return typed PipelineResult with all metadata
 */

import { ingestDocxFromBuffer, ingestDocxFromPath, ingestGDocHtml, ingestRawHtml, IngestError } from "./ingest/index.js";
import { convertIR, type ConversionResult } from "./convert/index.js";
import { ProgressReporter } from "./convert/progress.js";
import type { TipTapDoc } from "./ir.js";
import type { SemanticArtifact, AgentBrief } from "./semantic/types.js";

export type InputKind = "docx-path" | "docx-buffer" | "gdoc-html" | "raw-html";

export interface PipelineInput {
  kind: InputKind;
  /** For docx-path: absolute path to the .docx file. */
  filePath?: string;
  /** For docx-buffer: raw bytes of the .docx and original filename. */
  buffer?: Buffer;
  fileName?: string;
  /** For gdoc-html: raw clipboard HTML from Google Docs. */
  gdocHtml?: string;
  /** For raw-html: raw HTML or parsed Markdown string. */
  rawHtml?: string;
}

export interface PipelineResult extends ConversionResult {
  /** The intermediate TipTapDoc produced by ingestion. */
  ir: TipTapDoc;
  /** Total elapsed ms for the full pipeline (ingest + convert + validate). */
  elapsedMs: number;
  /** New — all OPTIONAL so the legacy HTML path (no extraction) still type-checks and runs.
   *  Populated separately via `runSemanticPipeline(ir)` (Phase 2, `semantic/extract.ts`),
   *  not inline in `runPipeline`, so conversion and extraction fail independently. */
  semanticArtifact?: SemanticArtifact;
  /** TODO(Phase 3): retype as `import("./visual/types.js").VisualPlan` once
   *  `app/src/visual/types.ts` lands (owned by another builder). Left as `unknown` for now
   *  per ARCH DECISION in docs/rebuild-architecture.md §3.3. */
  visualPlan?: unknown;
  /** Phase 8; stays undefined in Phases 0–6. */
  agentBrief?: AgentBrief;
}

/**
 * Run the full ingest → convert → validate pipeline.
 *
 * @param input     Describes the document source and format.
 * @param progress  Optional ProgressReporter for legible loading states.
 */
export async function runPipeline(
  input: PipelineInput,
  progress: ProgressReporter = new ProgressReporter()
): Promise<PipelineResult> {
  const start = Date.now();

  // ── Step 1: Ingest ────────────────────────────────────────────────────────
  progress.report("parsing", "Ingesting document…");

  let ir: TipTapDoc;
  try {
    switch (input.kind) {
      case "docx-path":
        if (!input.filePath) throw new Error("filePath is required for docx-path input");
        ir = await ingestDocxFromPath(input.filePath);
        break;
      case "docx-buffer":
        if (!input.buffer) throw new Error("buffer is required for docx-buffer input");
        ir = await ingestDocxFromBuffer(input.buffer, input.fileName ?? "upload.docx");
        break;
      case "gdoc-html":
        if (!input.gdocHtml) throw new Error("gdocHtml is required for gdoc-html input");
        ir = ingestGDocHtml(input.gdocHtml, input.fileName ?? "gdoc-paste");
        break;
      case "raw-html":
        if (!input.rawHtml) throw new Error("rawHtml is required for raw-html input");
        ir = ingestRawHtml(input.rawHtml, input.fileName ?? "upload");
        break;
      default: {
        const _exhaustive: never = input.kind;
        throw new Error(`Unknown input kind: ${String(_exhaustive)}`);
      }
    }
  } catch (err) {
    progress.report("error", `Ingestion failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err instanceof IngestError ? err : new Error(
      `Ingestion failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  progress.report("parsing", `Parsed "${ir.sourceFile}" — ${ir.content.length} top-level blocks`);

  // ── Step 2: Convert ───────────────────────────────────────────────────────
  let result: ConversionResult;
  try {
    result = await convertIR(ir, progress);
  } catch (err) {
    progress.report("error", `Conversion failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }

  const elapsedMs = Date.now() - start;
  return { ...result, ir, elapsedMs };
}
