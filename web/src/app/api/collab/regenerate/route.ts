import { NextResponse } from "next/server";
import { getState, saveState } from "../db";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { documentId, lockedIds = [] } = body as { documentId: string; lockedIds?: string[] };
  if (!documentId) {
    return NextResponse.json({ success: false, error: "Missing documentId" }, { status: 400 });
  }

  const hasKey =
    process.env["PLAYWRIGHT_TEST"] !== "true" &&
    process.env["MOCK_AI"] !== "true" &&
    ((!!process.env["ANTHROPIC_API_KEY"]?.trim() && !process.env["ANTHROPIC_API_KEY"]?.includes("api03")) ||
     (!!process.env["OPENAI_API_KEY"]?.trim() && !process.env["OPENAI_API_KEY"]?.includes("your-key-here")));

  try {
    const state = await getState(documentId);
    if (!state) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }

    const activeVersion = (state.versions as any[]).find(
      (v: any) => v.versionNumber === state.activeVersionNum
    );
    if (!activeVersion) {
      return NextResponse.json({ success: false, error: "Active version not found in document state" }, { status: 500 });
    }

    if (activeVersion.status !== "Draft") {
      return NextResponse.json({ success: false, error: "Only Draft documents can be regenerated." }, { status: 403 });
    }

    if (hasKey) {
      const { runPipeline } = await import("htmlcollab-app/pipeline");
      const { splicePreservedSections } = await import("htmlcollab-app/collab");
      const { validateDisclosure } = await import("htmlcollab-app/render");

      // Pass the current document HTML through the pipeline again.
      // We use gdoc-html because it safely parses rich HTML into our IR.
      const pipelineResult = await runPipeline({
        kind: "gdoc-html",
        gdocHtml: activeVersion.html as string,
        fileName: "regenerated-draft"
      });

      let updatedDocHtml = pipelineResult.html;
      let warnings = pipelineResult.disclosure?.warnings || [];

      // If there are locked sections, restore them into the newly generated HTML
      if (lockedIds.length > 0) {
        updatedDocHtml = splicePreservedSections(
          activeVersion.html as string,
          updatedDocHtml,
          new Set(lockedIds)
        );
        // We re-run progressive disclosure validation since we spliced things
        const postSpliceDisclosure = validateDisclosure(updatedDocHtml);
        if (!postSpliceDisclosure.valid) {
          return NextResponse.json({ success: false, error: "Regenerated document violated progressive disclosure after splicing locked sections." }, { status: 422 });
        }
        warnings = postSpliceDisclosure.warnings || [];
      }

      const nextVersionNum = state.activeVersionNum + 1;
      const newVersion = {
        versionNumber: nextVersionNum,
        html: updatedDocHtml,
        status: "Draft",
        timestamp: new Date().toISOString()
      };

      await saveState(
        { ...state, versions: [...(state.versions as any[]), newVersion], activeVersionNum: nextVersionNum, updatedAt: new Date().toISOString() },
        documentId
      );

      return NextResponse.json({
        success: true,
        html: updatedDocHtml,
        warnings
      });
    } else {
      // Mock / Simulation mode
      const { splicePreservedSections } = await import("htmlcollab-app/collab");
      
      // In simulation mode, we just add a small mock text at the top of the body, and preserve locked sections
      const mockGenerated = (activeVersion.html as string).replace(
        /<body[^>]*>/i, 
        (match) => `${match}\n<div class="vc-mock-regeneration bg-yellow-100 p-4 border-2 border-yellow-400 mb-4 rounded-lg font-bold">This is a simulated regeneration of the Draft document.</div>\n`
      );

      let finalHtml = mockGenerated;
      if (lockedIds.length > 0) {
        finalHtml = splicePreservedSections(
          activeVersion.html as string,
          mockGenerated,
          new Set(lockedIds)
        );
      }

      const nextVersionNum = state.activeVersionNum + 1;
      const newVersion = {
        versionNumber: nextVersionNum,
        html: finalHtml,
        status: "Draft",
        timestamp: new Date().toISOString()
      };

      await saveState(
        { ...state, versions: [...(state.versions as any[]), newVersion], activeVersionNum: nextVersionNum, updatedAt: new Date().toISOString() },
        documentId
      );

      return NextResponse.json({
        success: true,
        html: finalHtml,
        simulated: true,
        warnings: []
      });
    }
  } catch (err: any) {
    console.error("Regeneration error", err);
    return NextResponse.json({ success: false, error: err?.message ?? "Internal error during regeneration" }, { status: 500 });
  }
}
