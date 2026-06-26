import { NextResponse } from "next/server";
import { getState, saveState } from "../db";
import {
  validateEditRequest,
  validateLlmSectionResult,
  simulateEdit,
} from "htmlcollab-app/edit";

/**
 * POST /api/collab/edit
 *
 * Request JSON: { documentId, sectionId, sectionHtml, instruction }
 *
 * Behaviour:
 *  - If an LLM key is configured (ANTHROPIC_API_KEY or OPENAI_API_KEY):
 *      Call performSurgicalEdit from htmlcollab-app/edit.
 *      Validate the returned HTML has an element with id === sectionId (422 if not).
 *  - If NO key is configured:
 *      Return a deterministic, clearly-labelled simulation via simulateEdit().
 *
 * Response 200: { success: true, html: string, simulated: boolean }
 * Errors:       { success: false, error: string } with appropriate status.
 *
 * Auth: mirrors existing collab routes — no token enforcement, documentId-scoped.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------
  const errors = validateEditRequest(body as any);
  if (errors.length > 0) {
    return NextResponse.json(
      { success: false, error: errors.map((e) => e.message).join("; ") },
      { status: 400 }
    );
  }

  const { documentId, sectionId, sectionHtml, instruction } = body as {
    documentId: string;
    sectionId: string;
    sectionHtml: string;
    instruction: string;
  };

  // -------------------------------------------------------------------------
  // Determine whether an LLM key is available (same detection as convert route)
  // -------------------------------------------------------------------------
  const hasKey =
    process.env["PLAYWRIGHT_TEST"] !== "true" &&
    process.env["MOCK_AI"] !== "true" &&
    ((!!process.env["ANTHROPIC_API_KEY"]?.trim() && !process.env["ANTHROPIC_API_KEY"]?.includes("api03")) ||
     (!!process.env["OPENAI_API_KEY"]?.trim() && !process.env["OPENAI_API_KEY"]?.includes("your-key-here")));

  try {
    if (hasKey) {
      // -------------------------------------------------------------------
      // LLM path — surgical edit via htmlcollab-app
      // Lazy import so the no-key path never loads the SDK.
      // -------------------------------------------------------------------
      const { performSurgicalEdit } = await import("htmlcollab-app/edit");

      // Load current document state to get the full document HTML
      const state = await getState(documentId);
      if (!state) {
        return NextResponse.json(
          { success: false, error: "Document not found" },
          { status: 404 }
        );
      }

      const activeVersion = (state.versions as any[]).find(
        (v: any) => v.versionNumber === state.activeVersionNum
      );
      if (!activeVersion) {
        return NextResponse.json(
          { success: false, error: "Active version not found in document state" },
          { status: 500 }
        );
      }

      // performSurgicalEdit returns the full updated document HTML.
      const updatedDocHtml: string = await performSurgicalEdit(
        activeVersion.html as string,
        sectionId,
        instruction
      );

      // Extract just the updated section to return to the client.
      // We use a simple regex to pull the outerHTML by id — avoids importing
      // node-html-parser in the web package.  The section id was already
      // validated to exist by performSurgicalEdit (it throws if not found).
      // We also run the containment contract check via our pure helper.
      const idAttrRe = new RegExp(
        `<([a-zA-Z][a-zA-Z0-9-]*)\\b[^>]*\\bid\\s*=\\s*["']${escapeForRegex(sectionId)}["'][^>]*>[\\s\\S]*?</\\1>`,
        "i"
      );
      const sectionMatch = updatedDocHtml.match(idAttrRe);
      const updatedSectionHtml = sectionMatch ? sectionMatch[0] : updatedDocHtml;

      // Validate containment contract on the extracted section fragment.
      const contractError = validateLlmSectionResult(updatedSectionHtml, sectionId);
      if (contractError) {
        return NextResponse.json(
          { success: false, error: contractError },
          { status: 422 }
        );
      }

      // Persist updated document state
      const updatedVersions = (state.versions as any[]).map((v: any) =>
        v.versionNumber === state.activeVersionNum
          ? { ...v, html: updatedDocHtml, timestamp: new Date().toISOString() }
          : v
      );
      await saveState(
        { ...state, versions: updatedVersions, updatedAt: new Date().toISOString() },
        documentId
      );

      return NextResponse.json({
        success: true,
        html: updatedSectionHtml,
        simulated: false,
      });
    } else {
      // -------------------------------------------------------------------
      // No-key simulation path — purely deterministic, no LLM call
      // -------------------------------------------------------------------
      const simulatedHtml = simulateEdit(sectionHtml, sectionId, instruction);

      return NextResponse.json({
        success: true,
        html: simulatedHtml,
        simulated: true,
      });
    }
  } catch (err: any) {
    const status =
      err?.name === "AmbiguityError" ? 422
      : err?.message?.includes("not found") ? 404
      : 500;

    return NextResponse.json(
      { success: false, error: err?.message ?? "Internal error" },
      { status }
    );
  }
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
