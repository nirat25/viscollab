"use client";

/**
 * Shared helpers for web/src/components/visual/* (Phase 5, VISUI).
 *
 * Every leaf component takes semantic data as PROPS and reads nothing from
 * context (brief §6) — this module holds the small, pure lookup/formatting
 * helpers + the one shared xyflow node renderer (`FlowCardNode`, used by both
 * MindMapView and ArgumentMapView) so the id/data-attribute contract and the
 * restrained kind→tint mapping aren't duplicated per graph view.
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type {
  SemanticNode,
  SemanticNodeId,
  SemanticNodeKind,
  SourceRef,
} from "htmlcollab-app/semantic";

/** The node lookup every component receives — resolved once by the NodeView
 *  (or built once in the preview route) and passed down as a plain Map. */
export type SemanticNodeMap = ReadonlyMap<SemanticNodeId, SemanticNode>;

/** Resolve many ids -> nodes of a SPECIFIC kind, dropping unknown ids and any
 *  id that (contrary to the plan's invariants) doesn't match `kind`. Strongly
 *  typed via the SemanticNode discriminated union — no `as` casts at call sites. */
export function pickNodes<K extends SemanticNode["kind"]>(
  ids: readonly SemanticNodeId[] | undefined,
  nodes: SemanticNodeMap,
  kind: K
): Array<Extract<SemanticNode, { kind: K }>> {
  const out: Array<Extract<SemanticNode, { kind: K }>> = [];
  for (const id of ids ?? []) {
    const n = nodes.get(id);
    if (n && n.kind === kind) out.push(n as Extract<SemanticNode, { kind: K }>);
  }
  return out;
}

/** Resolve many ids -> nodes of ANY kind (mind map / argument map render
 *  mixed-kind node sets). Preserves order, drops unknown ids. */
export function lookupNodes(
  ids: readonly SemanticNodeId[] | undefined,
  nodes: SemanticNodeMap
): SemanticNode[] {
  const out: SemanticNode[] = [];
  for (const id of ids ?? []) {
    const n = nodes.get(id);
    if (n) out.push(n);
  }
  return out;
}

export function truncateQuote(quote: string | undefined, max = 80): string {
  if (!quote) return "";
  const clean = quote.trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

const RELATION_LABELS: Record<string, string> = {
  supports: "supports",
  contradicts: "contradicts",
  dependsOn: "depends on",
  blocks: "blocks",
  ownedBy: "owned by",
};

export function formatRelation(relation: string): string {
  return RELATION_LABELS[relation] ?? relation;
}

export type KindTint = "accent" | "pos" | "neg" | "risk" | "neutral";

/** Restrained kind -> tint token (brief C1: one accent + pos/neg/risk tints;
 *  every other kind stays neutral ink — no per-kind rainbow). */
export function kindTint(kind: SemanticNodeKind): KindTint {
  switch (kind) {
    case "decision":
      return "accent";
    case "risk":
      return "risk";
    case "action":
      return "pos";
    default:
      return "neutral";
  }
}

export function kindLabel(kind: SemanticNodeKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function nodeDisplayTitle(n: SemanticNode): string {
  return n.label ? `${n.label}: ${n.title}` : n.title;
}

export function EmptyState({ text }: { text: string }) {
  return <p className="dr-empty">{text}</p>;
}

/** First source quote, truncated, full quote in the title attribute. */
export function SourceChip({ sourceRefs }: { sourceRefs: SourceRef[] | undefined }) {
  const quote = sourceRefs?.[0]?.quote;
  if (!quote) return null;
  return (
    <span className="dr-source-chip" title={quote.trim()}>
      &ldquo;{truncateQuote(quote)}&rdquo;
    </span>
  );
}

/** Data carried by each xyflow node rendered via `FlowCardNode`. */
export interface FlowCardData extends Record<string, unknown> {
  title: string;
  kindText: string;
  tint: KindTint;
  /** "horizontal" = tiers left->right (MindMap); "vertical" = layers
   *  top->bottom (ArgumentMap). Controls which edges the handles sit on. */
  direction: "horizontal" | "vertical";
  /** Layout caption (e.g. the "Unlinked" column label) — NOT a semantic node:
   *  rendered without data-semantic-node-id so Phase-7 queries never match it. */
  caption?: boolean;
}

/** Shared read-only xyflow node — a simple labeled card, kind-tinted via a
 *  left accent stripe. `id` is supplied by xyflow (== the semantic node id,
 *  since callers set `node.id = semanticNode.id`), so this is the element
 *  that satisfies the data-semantic-node-id contract for graph views. */
export function FlowCardNode({ id, data }: NodeProps) {
  const d = data as unknown as FlowCardData;
  if (d.caption) {
    return <div className="dr-flow-caption">{d.title}</div>;
  }
  const vertical = d.direction === "vertical";
  const targetPosition = vertical ? Position.Bottom : Position.Left;
  const sourcePosition = vertical ? Position.Top : Position.Right;
  return (
    <div className={`dr-flow-card dr-tint-${d.tint}`} data-semantic-node-id={id}>
      <Handle type="target" position={targetPosition} style={{ opacity: 0 }} />
      <span className="dr-flow-card-kind">{d.kindText}</span>
      <span className="dr-flow-card-title">{d.title}</span>
      <Handle type="source" position={sourcePosition} style={{ opacity: 0 }} />
    </div>
  );
}
