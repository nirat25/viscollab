import { NextResponse } from "next/server";
import { runPipeline } from "htmlcollab-app/pipeline";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/options";
import { canEdit } from "htmlcollab-app/collab";
import { marked } from "marked";


export async function POST(request: Request) {
  try {
    let session = await getServerSession(authOptions);
    if (!session && process.env.PLAYWRIGHT_TEST === "true") {
      session = {
        user: { name: "Nirat", role: "collaborator", token: "token-collaborator" },
        expires: ""
      };
    }
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canEdit((session.user.role || "viewer") as any)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const contentType = request.headers.get("content-type") || "";
    let htmlResult = "";
    let fileName = "uploaded-doc";
    let warnings: string[] = [];


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
      warnings
    });
  } catch (e: any) {
    console.error("Pipeline conversion error", e);
    return NextResponse.json({ error: e.message || "Failed to convert document" }, { status: 500 });
  }
}
