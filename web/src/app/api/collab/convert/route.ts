import { NextResponse } from "next/server";
import { runPipeline } from "htmlcollab-app/pipeline";
import { marked } from "marked";
import { runSemanticPipeline, mockExtract } from "htmlcollab-app/semantic";
import { ingestRawHtml } from "htmlcollab-app/ingest";
import { noStore, persistenceErrorResponse, persistenceRepository, requiredString, sessionAccountId } from "../phase9";
import type { SemanticArtifact, SemanticPipelineOpts } from "htmlcollab-app/semantic";
import type { TipTapDoc } from "htmlcollab-app/ingest";
import type { VisualPlan } from "htmlcollab-app/visual";


/**
 * Run semantic extraction + visual planning for a completed pipeline IR.
 * Kept in its own try/catch (docs/rebuild-architecture.md §3.3): conversion and
 * extraction fail independently — a semantic failure must never 500 the whole
 * conversion, it only degrades to "no decision room" with a warning.
 */
async function attachSemanticPipeline(
  ir: TipTapDoc,
  warnings: string[],
  opts?: SemanticPipelineOpts
): Promise<{ semanticArtifact?: SemanticArtifact; visualPlan?: VisualPlan }> {
  try {
    const { semanticArtifact, visualPlan } = await runSemanticPipeline(ir, opts);
    return { semanticArtifact, visualPlan };
  } catch (e: any) {
    warnings.push(`semantic extraction failed: ${e?.message || String(e)}`);
    return {};
  }
}

export async function POST(request: Request) {
  try {
    const accountId = await sessionAccountId();
    if (!accountId) return noStore({ error: "unauthorized" }, 401);
    // Conversion has no document yet. It is deliberately scoped to the
    // workspace owner, never a global session role. Query avoids consuming a
    // multipart body before the file pipeline reads it.
    const workspaceId = requiredString(new URL(request.url).searchParams.get("workspaceId"));
    if (!workspaceId) return noStore({ error: "invalid_request" }, 400);
    const workspaces = await (await persistenceRepository()).listWorkspaces(accountId);
    if (!workspaces.some((workspace) => workspace.id === workspaceId && workspace.ownerAccountId === accountId)) {
      return noStore({ error: "forbidden" }, 403);
    }

    const contentType = request.headers.get("content-type") || "";
    let htmlResult = "";
    let fileName = "uploaded-doc";
    let warnings: string[] = [];
    let semanticArtifact: SemanticArtifact | undefined;
    let visualPlan: VisualPlan | undefined;

    // Check if running in mock/test environment
    const isMock = process.env.MOCK_AI === "true";
    if (isMock) {
      let rawHtml = "";
      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        if (!file) {
          return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }
        fileName = file.name;
        rawHtml = Buffer.from(await file.arrayBuffer()).toString("utf-8");
      } else if (contentType.includes("application/json")) {
        const body = await request.json();
        fileName = body.fileName || "gdoc-paste";
        rawHtml = body.gdocHtml || "";
      }
      
      // Simulate AI refinement by wrapping the content
      htmlResult = `<div id="mock-ai-refinement">${rawHtml}</div>`;
      const mockWarnings = ["Simulated AI conversion warnings"];

      // ORCHESTRATOR DECISION (BACK-012): web mock mode has no access to the
      // app package's fixture goldens (the package `exports` map does not expose
      // `app/tests/fixtures/*`), so mock conversion always uses mockExtract's
      // deterministic heuristic fallback rather than a registered fixture. That
      // heuristic is total and always schema-valid, which is sufficient for
      // web mock/e2e mode.
      try {
        const ir = ingestRawHtml(rawHtml, fileName);
        const attached = await attachSemanticPipeline(ir, mockWarnings, { extractor: mockExtract });
        semanticArtifact = attached.semanticArtifact;
        visualPlan = attached.visualPlan;
      } catch (e: any) {
        mockWarnings.push(`semantic extraction failed: ${e?.message || String(e)}`);
      }

      return NextResponse.json({
        success: true,
        fileName,
        html: htmlResult,
        warnings: mockWarnings,
        ...(semanticArtifact ? { semanticArtifact } : {}),
        ...(visualPlan ? { visualPlan } : {})
      });
    }


    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;
      if (!file) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }
      fileName = file.name;
      const buffer = Buffer.from(await file.arrayBuffer());

      const isHtml = fileName.toLowerCase().endsWith(".html") || fileName.toLowerCase().endsWith(".htm");
      const isMd = fileName.toLowerCase().endsWith(".md");
      let pipelineResult;
      
      if (isHtml) {
        pipelineResult = await runPipeline({
          kind: "raw-html",
          rawHtml: buffer.toString("utf-8"),
          fileName
        });
      } else if (isMd) {
        const mdText = buffer.toString("utf-8");
        const htmlParsed = await marked.parse(mdText);
        pipelineResult = await runPipeline({
          kind: "raw-html",
          rawHtml: htmlParsed,
          fileName
        });
      } else {
        pipelineResult = await runPipeline({
          kind: "docx-buffer",
          buffer,
          fileName
        });
      }
      htmlResult = pipelineResult.html;
      if (pipelineResult.disclosure && pipelineResult.disclosure.warnings) {
        warnings = pipelineResult.disclosure.warnings;
      }
      const attached = await attachSemanticPipeline(pipelineResult.ir, warnings);
      semanticArtifact = attached.semanticArtifact;
      visualPlan = attached.visualPlan;
    } else if (contentType.includes("application/json")) {
      const body = await request.json();
      if (!body.gdocHtml) {
        return NextResponse.json({ error: "No gdocHtml content provided" }, { status: 400 });
      }
      fileName = body.fileName || "gdoc-paste";

      // Run pipeline with gdoc-html paste
      const pipelineResult = await runPipeline({
        kind: "gdoc-html",
        gdocHtml: body.gdocHtml,
        fileName
      });
      htmlResult = pipelineResult.html;
      if (pipelineResult.disclosure && pipelineResult.disclosure.warnings) {
        warnings = pipelineResult.disclosure.warnings;
      }
      const attached = await attachSemanticPipeline(pipelineResult.ir, warnings);
      semanticArtifact = attached.semanticArtifact;
      visualPlan = attached.visualPlan;
    } else {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
    }

    if (warnings.length > 0) {
      console.warn(`[Pipeline Warnings for ${fileName}]:`, warnings);
    }

    return NextResponse.json({
      success: true,
      fileName,
      html: htmlResult,
      warnings,
      ...(semanticArtifact ? { semanticArtifact } : {}),
      ...(visualPlan ? { visualPlan } : {})
    });
  } catch (e: any) {
    return persistenceErrorResponse(e);
  }
}
