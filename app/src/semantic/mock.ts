/**
 * Deterministic, key-free mock extraction (SEM-007).
 *
 * Strategy (docs/rebuild-architecture.md §5.4):
 *  1. FIXTURE MAP FIRST — goldens registered via registerMockFixture() are
 *     returned for a matching `ir.sourceFile` (exact, then basename). Tests and
 *     the web convert route (MOCK_AI / PLAYWRIGHT_TEST) register the committed
 *     golden artifacts explicitly; nothing is read from disk here, so the
 *     compiled dist stays self-contained.
 *  2. HEURISTIC FALLBACK — a pure structural extractor for any unknown input.
 *     It must ALWAYS return a schema-valid artifact and NEVER throw. Quotes are
 *     copied verbatim from the IR so sourceTrace resolves them.
 */

import type { TipTapDoc } from "../ir.js";
import type {
  ActionNode,
  DecisionNode,
  QuestionNode,
  SemanticArtifact,
  SemanticNode,
  SemanticNodeKind,
} from "./types.js";
import { validateSemanticArtifact } from "./schema.js";
import { resolveSourceRefs } from "./sourceTrace.js";
import { artifactIdFor } from "./extract.js";

// ── Fixture registry ─────────────────────────────────────────────────────────

const fixtureRegistry = new Map<string, SemanticArtifact>();

const basename = (p: string): string => p.split(/[\\/]/).pop() ?? p;

/** Register a golden artifact for a sourceFile (exact and basename keys).
 *  Throws if the golden is not schema-valid: an invalid fixture would silently
 *  break mockExtract's "always schema-valid" guarantee. */
export function registerMockFixture(sourceFile: string, artifact: SemanticArtifact): void {
  const check = validateSemanticArtifact(artifact);
  if (!check.valid) {
    throw new Error(
      `registerMockFixture("${sourceFile}"): golden is not schema-valid: ${check.errors.join("; ")}`
    );
  }
  fixtureRegistry.set(sourceFile, artifact);
  fixtureRegistry.set(basename(sourceFile), artifact);
}

/** Test hook — clears registered fixtures (the heuristic path needs a clean slate). */
export function clearMockFixtures(): void {
  fixtureRegistry.clear();
}

// ── Heuristic structural extraction ──────────────────────────────────────────

/** Inline text of any IR node (headings/paragraphs/list items), verbatim join. */
interface AnyIrNode {
  type: string;
  text?: string;
  content?: AnyIrNode[];
}
function inlineText(node: AnyIrNode): string {
  if (node.type === "text") return node.text ?? "";
  if (Array.isArray(node.content)) return node.content.map(inlineText).join("");
  return "";
}

interface Scanned {
  headings: string[];
  paragraphs: string[];
  /** bullet/ordered list items grouped under the heading that precedes them */
  listItemsByHeading: Array<{ heading: string; items: string[] }>;
}

function scan(ir: TipTapDoc): Scanned {
  const s: Scanned = { headings: [], paragraphs: [], listItemsByHeading: [] };
  let currentHeading = "";
  for (const block of ir.content) {
    if (block.type === "heading") {
      currentHeading = inlineText(block).trim();
      if (currentHeading) s.headings.push(currentHeading);
    } else if (block.type === "paragraph") {
      const t = inlineText(block).trim();
      if (t) s.paragraphs.push(t);
    } else if (block.type === "bulletList" || block.type === "orderedList") {
      const items = (block.content ?? [])
        .map((li) => inlineText(li as AnyIrNode).trim())
        .filter(Boolean);
      if (items.length) s.listItemsByHeading.push({ heading: currentHeading, items });
    }
  }
  return s;
}

/**
 * Pure heuristic extraction. Total: any TipTapDoc (including empty) yields a
 * schema-valid artifact. Deterministic: same IR → deep-equal artifact.
 */
export function heuristicExtract(ir: TipTapDoc): SemanticArtifact {
  const { headings, paragraphs, listItemsByHeading } = scan(ir);

  const counters = new Map<SemanticNodeKind, number>();
  const nextId = (kind: SemanticNodeKind) => {
    const n = (counters.get(kind) ?? 0) + 1;
    counters.set(kind, n);
    return `${kind}_${n}`;
  };

  const title = headings[0] ?? ir.sourceFile;
  const lead = paragraphs[0] ?? headings[0] ?? "";
  const nodes: SemanticNode[] = [];

  // Decision anchor. With no textual support (empty doc) mark missing_evidence —
  // that is the schema-sanctioned way to stay valid without a quote.
  const decision: DecisionNode = {
    id: nextId("decision"),
    kind: "decision",
    title,
    summary: lead || `No summary available for ${ir.sourceFile}.`,
    question: `Review and align on: ${title}`,
    sourceRefs: lead ? [{ quote: lead }] : [],
    sourceStatus: lead ? "inferred" : "missing_evidence",
    status: "proposed",
  };
  nodes.push(decision);

  // Subsequent headings → claims (structural gist of the document).
  for (const h of headings.slice(1, 8)) {
    nodes.push({
      id: nextId("claim"),
      kind: "claim",
      title: h,
      summary: h,
      sourceRefs: [{ quote: h }],
      sourceStatus: "explicit",
    });
  }

  // Bullets under an actions-ish heading → actions.
  for (const group of listItemsByHeading) {
    if (!/action|next step|todo|to-do|plan/i.test(group.heading)) continue;
    for (const item of group.items.slice(0, 10)) {
      const action: ActionNode = {
        id: nextId("action"),
        kind: "action",
        title: item.length > 80 ? `${item.slice(0, 77)}...` : item,
        summary: item,
        sourceRefs: [{ quote: item }],
        sourceStatus: "explicit",
      };
      nodes.push(action);
    }
  }

  // Sentences/items ending in "?" → open questions.
  const questionTexts = [
    ...paragraphs.filter((p) => p.trimEnd().endsWith("?")),
    ...listItemsByHeading.flatMap((g) => g.items.filter((i) => i.trimEnd().endsWith("?"))),
  ];
  for (const q of questionTexts.slice(0, 6)) {
    const node: QuestionNode = {
      id: nextId("question"),
      kind: "question",
      title: q.length > 80 ? `${q.slice(0, 77)}...` : q,
      summary: q,
      sourceRefs: [{ quote: q }],
      sourceStatus: "explicit",
    };
    nodes.push(node);
  }

  const artifact: SemanticArtifact = {
    schemaVersion: 1,
    id: artifactIdFor(ir),
    sourceFile: ir.sourceFile,
    title,
    bluf: lead || `Imported document: ${title}`,
    thesis: lead || title,
    primaryDecisionId: decision.id,
    nodes,
    extractedBy: "mock",
  };

  return resolveSourceRefs(artifact, ir);
}

// ── Public mock entry point ──────────────────────────────────────────────────

/**
 * Deterministic mock extractor: registered golden for known sourceFiles,
 * heuristic fallback otherwise. Never throws; always schema-valid.
 */
export function mockExtract(ir: TipTapDoc): SemanticArtifact {
  const fixture = fixtureRegistry.get(ir.sourceFile) ?? fixtureRegistry.get(basename(ir.sourceFile));
  // Clone so a mutating consumer cannot poison the registry for later calls.
  if (fixture) return structuredClone(fixture);

  try {
    const artifact = heuristicExtract(ir);
    const check = validateSemanticArtifact(artifact);
    if (check.valid) return artifact;
    // Fall through to the degenerate artifact below — never return invalid.
    console.warn(`[mock] heuristic artifact invalid (${check.errors.join("; ")}); degrading`);
  } catch (e) {
    console.warn(`[mock] heuristic extraction threw (${(e as Error).message}); degrading`);
  }

  // Degenerate but valid: single missing_evidence decision.
  const decision: DecisionNode = {
    id: "decision_1",
    kind: "decision",
    title: ir.sourceFile,
    summary: `Imported document: ${ir.sourceFile}`,
    question: `Review and align on: ${ir.sourceFile}`,
    sourceRefs: [],
    sourceStatus: "missing_evidence",
    status: "proposed",
  };
  return {
    schemaVersion: 1,
    id: artifactIdFor(ir),
    sourceFile: ir.sourceFile,
    title: ir.sourceFile,
    bluf: `Imported document: ${ir.sourceFile}`,
    thesis: ir.sourceFile,
    primaryDecisionId: decision.id,
    nodes: [decision],
    extractedBy: "mock",
  };
}
