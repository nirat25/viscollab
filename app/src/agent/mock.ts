/** Key-free deterministic Ask implementation for CI and explicit development mock mode. */

import type { SemanticArtifact, SemanticNode } from "../semantic/types.js";
import type { AgentPreset, GroundedAgentAnswer, RawAgentAnswer } from "./types.js";
import {
  INSUFFICIENT_EVIDENCE_MESSAGE,
  isCitableNode,
  materializeGroundedAnswer,
} from "./ask.js";

const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "i", "in", "is", "it", "of", "on", "or", "the", "this", "to", "what", "when", "which", "with", "would", "you"]);

function terms(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu)?.filter((term) => !STOP_WORDS.has(term)) ?? [];
}

function firstCitableRef(node: SemanticNode): number | undefined {
  const refs: unknown = node.sourceRefs;
  if (!Array.isArray(refs)) return undefined;
  const index = refs.findIndex(
    (ref) => typeof ref === "object" && ref !== null &&
      typeof (ref as Record<string, unknown>)["quote"] === "string" &&
      ((ref as Record<string, unknown>)["quote"] as string).trim() !== ""
  );
  return index < 0 ? undefined : index;
}

function nodeSearchText(node: SemanticNode): string {
  const refs: unknown = node.sourceRefs;
  const quotes = Array.isArray(refs)
    ? refs.flatMap((ref) => {
        if (typeof ref !== "object" || ref === null) return [];
        const quote = (ref as Record<string, unknown>)["quote"];
        return typeof quote === "string" ? [quote] : [];
      })
    : [];
  const details = [node.title, node.summary, ...quotes];
  if (node.kind === "decision") details.push(node.question);
  if (node.kind === "action") details.push(node.owner ?? "", node.due ?? "");
  return details.join(" ");
}

/** Stable lexical retrieval. It synthesizes only from canonical node summaries and citations. */
export function mockAskDecisionRoom(
  artifact: SemanticArtifact,
  question: string,
  preset: AgentPreset
): GroundedAgentAnswer {
  const queryTerms = new Set(terms(question));
  const ranked = artifact.nodes
    .map((node, index) => {
      const haystack = new Set(terms(nodeSearchText(node)));
      const score = [...queryTerms].filter((term) => haystack.has(term)).length;
      return { node, index, score };
    })
    .filter(({ node, score }) => isCitableNode(node) && score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3);
  const primary = artifact.nodes.find((node) => node.id === artifact.primaryDecisionId && isCitableNode(node));
  const selected = ranked.length > 0 ? ranked.map(({ node }) => node) : primary ? [primary] : [];
  if (selected.length === 0) {
    return materializeGroundedAnswer(
      { answer: INSUFFICIENT_EVIDENCE_MESSAGE, citations: [], insufficientEvidence: true },
      artifact,
      preset,
      "mock-lexical-v1",
      true
    );
  }
  const raw: RawAgentAnswer = {
    answer: selected.map((node) => node.summary || node.title).join("\n\n"),
    citations: selected.map((node) => ({ semanticNodeId: node.id, sourceRefIndex: firstCitableRef(node)! })),
  };
  return materializeGroundedAnswer(raw, artifact, preset, "mock-lexical-v1", true);
}
