/**
 * Source-trace helpers (SEM-003) — docs/rebuild-architecture.md §5.2.
 *
 * Maps each SemanticNode's SourceRef.quote back to a character span in the IR's
 * whitespace-normalized plain text (`nodeToPlainText(ir)`), mirroring the existing
 * comment-anchor text-quote model in `collab/comments.ts` (`cleanText`: strip
 * zero-width spaces, collapse all whitespace runs to a single space, trim).
 * Kept as a local copy rather than importing `collab/comments.ts` to avoid coupling
 * the semantic layer to the DOM-oriented collab module.
 */

import type { TipTapDoc } from "../ir.js";
import { nodeToPlainText } from "../ir.js";
import type { SemanticArtifact, SemanticNode, SourceRef } from "./types.js";

/** Mirrors collab/comments.ts `cleanText`: strip zero-width spaces, collapse whitespace, trim. */
function normalizeWhitespace(s: string): string {
  return (s || "").replace(/\u200b/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Resolve every SourceRef.quote in the artifact against the whitespace-normalized
 * plain text of the IR, filling in `charStart`/`charEnd` on exact match. Never
 * throws — a quote that cannot be located is left with `charStart`/`charEnd`
 * undefined so the caller (or `validateSourceTrace`) can flag it separately.
 *
 * Pure: returns a new SemanticArtifact, does not mutate the input.
 */
export function resolveSourceRefs(artifact: SemanticArtifact, ir: TipTapDoc): SemanticArtifact {
  const fullText = normalizeWhitespace(nodeToPlainText(ir));

  const resolveRef = (ref: SourceRef): SourceRef => {
    const quote = normalizeWhitespace(ref.quote);
    if (!quote) return { ...ref };
    const idx = fullText.indexOf(quote);
    if (idx === -1) return { ...ref };
    return { ...ref, charStart: idx, charEnd: idx + quote.length };
  };

  return {
    ...artifact,
    nodes: artifact.nodes.map(
      (node): SemanticNode => ({ ...node, sourceRefs: node.sourceRefs.map(resolveRef) })
    ),
  };
}

export interface SourceTraceResult {
  valid: boolean;
  errors: string[];
}

/** Walk a blockPath (index path into TipTapDoc.content, recursing through each
 *  visited node's `content` array) and report whether it indexes a real block. */
function isValidBlockPath(ir: TipTapDoc, path: number[]): boolean {
  if (path.length === 0) return false;

  let content: unknown = ir.content;
  let node: unknown;

  for (const idx of path) {
    if (!Array.isArray(content) || !Number.isInteger(idx) || idx < 0 || idx >= content.length) {
      return false;
    }
    node = content[idx];
    const record = node as Record<string, unknown> | null;
    content = record && Array.isArray(record["content"]) ? record["content"] : undefined;
  }

  return node !== undefined;
}

/**
 * Deterministic anti-fabrication guard, distinct from the LLM eval: any SourceRef
 * whose `quote` does not appear verbatim (whitespace-normalized) in the IR's plain
 * text is an error, and any `blockPath` that does not index a real block is an error.
 */
export function validateSourceTrace(artifact: SemanticArtifact, ir: TipTapDoc): SourceTraceResult {
  const errors: string[] = [];
  const fullText = normalizeWhitespace(nodeToPlainText(ir));

  for (const node of artifact.nodes) {
    for (const ref of node.sourceRefs) {
      const quote = normalizeWhitespace(ref.quote);
      if (!quote || !fullText.includes(quote)) {
        errors.push(`node "${node.id}" has a sourceRef quote not found in source: ${JSON.stringify(ref.quote)}`);
      }
      if (ref.blockPath !== undefined && !isValidBlockPath(ir, ref.blockPath)) {
        errors.push(
          `node "${node.id}" has a sourceRef blockPath that does not index a real block: [${ref.blockPath.join(",")}]`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
