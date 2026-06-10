/**
 * P2-T2 deterministic tests: pipeline wiring
 *
 * Tests the full ingest → convert → validate pipeline with a mocked LLM.
 * No actual LLM API calls are made — the `complete` function is vi.mocked.
 *
 * Verifies:
 *  - Progress stages fire in the correct order (parsing → converting → validating → done)
 *  - Pipeline result contains IR, html, contract, model, sourceFile, elapsedMs
 *  - Contract is validated on the mocked HTML output
 *  - Ingestion errors are surfaced correctly
 *  - Invalid HTML from the LLM is still returned (contract.valid = false, not thrown)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProgressStage } from "../../src/convert/progress.js";

// ── Mock the LLM complete() so no API call is made ───────────────────────────

vi.mock("../../src/convert/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/convert/client.js")>();
  return {
    ...actual,
    complete: vi.fn().mockResolvedValue("<article><h1 id='lead'>Summary</h1><p>Body</p></article>"),
  };
});

// Import after mock is set up
import { runPipeline } from "../../src/pipeline.js";
import { ProgressReporter } from "../../src/convert/progress.js";
import { complete } from "../../src/convert/client.js";

const SAMPLE_DOCX_PATH = new URL("../fixtures/sample.docx", import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, "$1"); // Windows: remove leading / before drive letter

// ── Progress stage ordering ───────────────────────────────────────────────────

describe("runPipeline — progress stages", () => {
  it("fires parsing, converting, validating, done stages in order", async () => {
    const stages: ProgressStage[] = [];
    const progress = new ProgressReporter((evt) => stages.push(evt.stage));

    await runPipeline({ kind: "docx-path", filePath: SAMPLE_DOCX_PATH }, progress);

    expect(stages).toContain("parsing");
    expect(stages).toContain("converting");
    expect(stages).toContain("validating");
    expect(stages).toContain("done");

    // parsing must come before converting
    expect(stages.indexOf("parsing")).toBeLessThan(stages.indexOf("converting"));
    // converting must come before validating
    expect(stages.indexOf("converting")).toBeLessThan(stages.indexOf("validating"));
    // done must be last non-error stage
    expect(stages.lastIndexOf("done")).toBeGreaterThan(stages.indexOf("validating"));
  });

  it("includes a descriptive message for each stage", async () => {
    const messages: string[] = [];
    const progress = new ProgressReporter((evt) => messages.push(evt.message));

    await runPipeline({ kind: "docx-path", filePath: SAMPLE_DOCX_PATH }, progress);

    // Each message should be non-empty
    for (const msg of messages) {
      expect(msg.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── Pipeline result shape ─────────────────────────────────────────────────────

describe("runPipeline — result shape", () => {
  beforeEach(() => {
    vi.mocked(complete).mockResolvedValue(
      "<article><h1 id='lead'>Summary</h1><p>Body</p></article>"
    );
  });

  it("returns a TipTapDoc IR in result.ir", async () => {
    const result = await runPipeline({ kind: "docx-path", filePath: SAMPLE_DOCX_PATH });
    expect(result.ir).toBeDefined();
    expect(result.ir.type).toBe("doc");
    expect(result.ir.content.length).toBeGreaterThan(0);
  });

  it("returns the HTML string from the (mocked) LLM", async () => {
    const result = await runPipeline({ kind: "docx-path", filePath: SAMPLE_DOCX_PATH });
    expect(result.html).toContain("<article>");
    expect(result.html).toContain("Summary");
  });

  it("returns a validated contract", async () => {
    const result = await runPipeline({ kind: "docx-path", filePath: SAMPLE_DOCX_PATH });
    expect(result.contract).toBeDefined();
    expect(typeof result.contract.valid).toBe("boolean");
    expect(typeof result.contract.headingCount).toBe("number");
  });

  it("returns model and promptVersion metadata", async () => {
    const result = await runPipeline({ kind: "docx-path", filePath: SAMPLE_DOCX_PATH });
    expect(result.model).toBeTruthy();
    expect(result.promptVersion).toMatch(/^conv-v/);
  });

  it("returns elapsedMs as a positive number", async () => {
    const result = await runPipeline({ kind: "docx-path", filePath: SAMPLE_DOCX_PATH });
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("returns sourceFile matching the input filename", async () => {
    const result = await runPipeline({ kind: "docx-path", filePath: SAMPLE_DOCX_PATH });
    expect(result.sourceFile).toBe("sample.docx");
  });
});

// ── Contract validation on mocked output ─────────────────────────────────────

describe("runPipeline — contract on mocked HTML", () => {
  it("contract.valid = true for a clean mocked artifact", async () => {
    vi.mocked(complete).mockResolvedValue(
      "<article><h1 id='s1'>Title</h1><p>Body</p><a href='#s1'>Top</a></article>"
    );
    const result = await runPipeline({ kind: "docx-path", filePath: SAMPLE_DOCX_PATH });
    expect(result.contract.valid).toBe(true);
  });

  it("contract.valid = false when mocked LLM returns HTML with <script>", async () => {
    vi.mocked(complete).mockResolvedValue("<script>alert(1)</script><p>content</p>");
    const result = await runPipeline({ kind: "docx-path", filePath: SAMPLE_DOCX_PATH });
    // Pipeline does NOT throw — it returns the result with contract.valid = false
    expect(result.contract.valid).toBe(false);
    expect(result.contract.hasScript).toBe(true);
  });

  it("strips fences from mocked LLM output before validation", async () => {
    vi.mocked(complete).mockResolvedValue(
      "```html\n<article><h1 id='t'>T</h1></article>\n```"
    );
    const result = await runPipeline({ kind: "docx-path", filePath: SAMPLE_DOCX_PATH });
    expect(result.html).not.toContain("```");
    expect(result.html).toContain("<article>");
  });
});

// ── GDoc HTML input path ──────────────────────────────────────────────────────

describe("runPipeline — gdoc-html input", () => {
  it("accepts GDoc HTML paste and returns a valid result", async () => {
    vi.mocked(complete).mockResolvedValue("<h1 id='g'>GDoc Summary</h1><p>Content</p>");
    const gdocHtml = `<body>
      <h1>GDoc Document</h1>
      <p>Some <b>important</b> content here.</p>
      <ul><li>Point one</li><li>Point two</li></ul>
    </body>`;
    const result = await runPipeline({ kind: "gdoc-html", gdocHtml, fileName: "my-doc.gdoc" });
    expect(result.ir.type).toBe("doc");
    expect(result.html).toContain("GDoc Summary");
  });
});

// ── Error cases ───────────────────────────────────────────────────────────────

describe("runPipeline — error cases", () => {
  it("reports error stage and throws for missing filePath", async () => {
    const stages: ProgressStage[] = [];
    const progress = new ProgressReporter((evt) => stages.push(evt.stage));
    await expect(
      runPipeline({ kind: "docx-path", filePath: undefined }, progress)
    ).rejects.toThrow();
    expect(stages).toContain("error");
  });

  it("throws for a non-existent file path", async () => {
    await expect(
      runPipeline({ kind: "docx-path", filePath: "/does/not/exist/fake.docx" })
    ).rejects.toThrow();
  });

  it("throws for missing gdocHtml", async () => {
    await expect(
      runPipeline({ kind: "gdoc-html", gdocHtml: undefined })
    ).rejects.toThrow();
  });
});
