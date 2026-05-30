// Canonical intermediate representation (IR).
// Parser output and conversion input. Deliberately minimal for the spike;
// P1-T3 ADR / P2-T1 will formalize the production IR.

export type Block =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "image"; alt: string };

export interface Section {
  heading: string;
  level: number; // 1..6; 0 = preamble before any heading
  blocks: Block[];
}

export interface DocIR {
  title: string;
  sections: Section[];
  meta: {
    sourceFile: string;
    // doc type is NOT prescribed — the conversion LLM judges it. "auto" = let the model decide.
    docType: "auto";
  };
}

// Flatten the IR to plain text — used by the judge to compare against the
// generated HTML for fabrication/omission checks (P1-T1 test d).
export function irToPlainText(ir: DocIR): string {
  const lines: string[] = [`# ${ir.title}`];
  for (const s of ir.sections) {
    if (s.heading) lines.push(`\n${"#".repeat(Math.max(1, s.level))} ${s.heading}`);
    for (const b of s.blocks) {
      switch (b.type) {
        case "paragraph":
          lines.push(b.text);
          break;
        case "list":
          lines.push(...b.items.map((i) => `- ${i}`));
          break;
        case "table":
          lines.push(b.headers.join(" | "));
          lines.push(...b.rows.map((r) => r.join(" | ")));
          break;
        case "image":
          lines.push(`[image: ${b.alt}]`);
          break;
      }
    }
  }
  return lines.join("\n");
}
