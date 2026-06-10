/**
 * Generates a sample .docx fixture for tests.
 * Run once: node --loader ts-node/esm tests/fixtures/generate-docx.mjs
 *
 * We use the `docx` npm package to create a real, valid .docx binary
 * with headings, paragraphs, a list, a table, and a paragraph with bold/italic.
 *
 * Note: This is a dev-time helper. The generated file is committed to the repo
 * so tests do not need to regenerate it on every CI run.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// We use the `docx` package if available, otherwise fall back to a minimal
// OOXML zip we construct manually. This keeps the fixture generator self-contained.

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, "sample.docx");

async function main() {
  // Try to use the `docx` package
  try {
    const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, UnderlineType } = await import("docx");

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: "Vendor Consolidation Decision",
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({
              children: [
                new TextRun("This document outlines the recommendation to consolidate analytics vendors."),
              ],
            }),
            new Paragraph({
              text: "Background",
              heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph({
              children: [
                new TextRun("Our engineering team currently manages "),
                new TextRun({ text: "three separate analytics vendors", bold: true }),
                new TextRun(" with significant overlap in capabilities."),
              ],
            }),
            new Paragraph({
              text: "Recommendation",
              heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph({
              children: [new TextRun({ text: "Consolidate onto Vendor A this quarter", italics: true })],
              bullet: { level: 0 },
            }),
            new Paragraph({
              children: [new TextRun("Migrate reporting dashboards by end of Q3")],
              bullet: { level: 0 },
            }),
            new Paragraph({
              children: [new TextRun("Negotiate a volume discount")],
              bullet: { level: 0 },
            }),
            new Paragraph({
              text: "Cost Comparison",
              heading: HeadingLevel.HEADING_2,
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  tableHeader: true,
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Vendor", bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Monthly Cost", bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Features", bold: true })] })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Vendor A")] }),
                    new TableCell({ children: [new Paragraph("$8,000")] }),
                    new TableCell({ children: [new Paragraph("Full suite")] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Vendor B")] }),
                    new TableCell({ children: [new Paragraph("$5,000")] }),
                    new TableCell({ children: [new Paragraph("Limited reporting")] }),
                  ],
                }),
              ],
            }),
            new Paragraph({
              text: "Conclusion",
              heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph({
              children: [
                new TextRun("Consolidation will save "),
                new TextRun({ text: "$120k per year", bold: true }),
                new TextRun(" and reduce integration overhead."),
              ],
            }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    writeFileSync(outputPath, buffer);
    console.log(`✅ Generated ${outputPath} (${buffer.length} bytes)`);
  } catch (err) {
    console.error("❌ `docx` package not available. Install it: npm install --save-dev docx");
    console.error(err);
    process.exit(1);
  }
}

main();
