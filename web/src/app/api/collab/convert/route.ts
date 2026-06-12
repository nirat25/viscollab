import { NextResponse } from "next/server";
import { runPipeline } from "htmlcollab-app/pipeline";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let htmlResult = "";
    let fileName = "uploaded-doc";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;
      if (!file) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }
      fileName = file.name;
      const buffer = Buffer.from(await file.arrayBuffer());

      // Run pipeline with docx buffer
      const pipelineResult = await runPipeline({
        kind: "docx-buffer",
        buffer,
        fileName
      });
      htmlResult = pipelineResult.html;
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
    } else {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      fileName,
      html: htmlResult
    });
  } catch (e: any) {
    console.error("Pipeline conversion error", e);
    return NextResponse.json({ error: e.message || "Failed to convert document" }, { status: 500 });
  }
}
