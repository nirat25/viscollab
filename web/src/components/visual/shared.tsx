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

import { Handle, MarkerType, Position, type Edge, type NodeProps } from "@xyflow/react";
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
  /** Visually anchor this card (the graph's root/decision node). */
  emphasis?: boolean;
}

/** How many connection slots each card side exposes (see FlowCardNode). Edges
 *  round-robin across these so parallel edges on one card don't stack. */
export const HANDLE_SLOTS = 3;
export function sourceHandleId(i: number): string {
  return `s${((i % HANDLE_SLOTS) + HANDLE_SLOTS) % HANDLE_SLOTS}`;
}
export function targetHandleId(i: number): string {
  return `t${((i % HANDLE_SLOTS) + HANDLE_SLOTS) % HANDLE_SLOTS}`;
}

/** Evenly spread N handles along a side: for 3 slots -> 25% / 50% / 75%. */
const SLOT_OFFSETS = Array.from(
  { length: HANDLE_SLOTS },
  (_, i) => `${((i + 1) / (HANDLE_SLOTS + 1)) * 100}%`
);

/** Shared read-only xyflow node — a simple labeled card, kind-tinted via a
 *  left accent stripe. `id` is supplied by xyflow (== the semantic node id,
 *  since callers set `node.id = semanticNode.id`), so this is the element
 *  that satisfies the data-semantic-node-id contract for graph views.
 *
 *  Each side exposes HANDLE_SLOTS invisible handles (ids s0..sN / t0..tN)
 *  spread along the edge so callers route parallel edges to distinct points
 *  instead of one shared handle. Both graph views set an explicit
 *  source/target handle id per edge (xyflow needs one when >1 handle exists). */
export function FlowCardNode({ id, data }: NodeProps) {
  const d = data as unknown as FlowCardData;
  const vertical = d.direction === "vertical";
  const targetPosition = vertical ? Position.Bottom : Position.Left;
  const sourcePosition = vertical ? Position.Top : Position.Right;
  const emphasisClass = d.emphasis ? " dr-flow-card-root" : "";
  // Offsets run along the free axis of each side (down a vertical side, across
  // a horizontal side).
  const along = (offset: string) =>
    vertical ? { left: offset } : { top: offset };
  return (
    <div
      className={`dr-flow-card dr-tint-${d.tint}${emphasisClass}`}
      data-semantic-node-id={id}
    >
      {SLOT_OFFSETS.map((offset, i) => (
        <Handle
          key={`t${i}`}
          id={`t${i}`}
          type="target"
          position={targetPosition}
          style={{ opacity: 0, ...along(offset) }}
        />
      ))}
      <span className="dr-flow-card-kind">{d.kindText}</span>
      <span className="dr-flow-card-title">{d.title}</span>
      {SLOT_OFFSETS.map((offset, i) => (
        <Handle
          key={`s${i}`}
          id={`s${i}`}
          type="source"
          position={sourcePosition}
          style={{ opacity: 0, ...along(offset) }}
        />
      ))}
    </div>
  );
}

/** Relation-kind -> calm stroke + dash. This is the disambiguation carrier:
 *  once every edge is colored by what it MEANS, the per-edge text labels become
 *  redundant clutter in a dense mind map (dropped there in favor of a static
 *  legend) while staying useful in the sparse argument map. Max four muted
 *  colors — slate / green / red / gray — never a rainbow (brief C1). */
interface RelationVisual {
  stroke: string;
  dashed: boolean;
}

const RELATION_VISUALS: Record<string, RelationVisual> = {
  dependsOn: { stroke: "var(--dr-ink-soft, #475569)", dashed: false },
  supports: { stroke: "var(--dr-pos, #15803d)", dashed: false },
  contradicts: { stroke: "var(--dr-neg, #b91c1c)", dashed: true },
  blocks: { stroke: "var(--dr-neg, #b91c1c)", dashed: true },
  ownedBy: { stroke: "var(--dr-ink-muted, #64748b)", dashed: false },
};

const DEFAULT_RELATION_VISUAL: RelationVisual = {
  stroke: "var(--dr-ink-soft, #475569)",
  dashed: false,
};

/** Canonical legend order — only the kinds actually present are shown. */
export const RELATION_LEGEND_ORDER = [
  "dependsOn",
  "supports",
  "contradicts",
  "blocks",
  "ownedBy",
] as const;

export function relationVisual(relation: string | undefined): RelationVisual {
  return (relation ? RELATION_VISUALS[relation] : undefined) ?? DEFAULT_RELATION_VISUAL;
}

/** One calm edge style for every graph view: a BEZIER curve (type "default")
 *  — parallel edges fan out from a shared handle and stay individually
 *  traceable instead of merging into overlapping orthogonal segments the way
 *  smoothstep did — colored + dashed by relation kind (`relationVisual`),
 *  closed arrowhead in the matching color. Per-edge text label is opt-in
 *  (`showLabel`): the mind map suppresses it (legend carries meaning), the
 *  argument map keeps it. `sourceHandle`/`targetHandle` let a caller spread
 *  parallel edges across distinct connection points. */
export function calmEdge(opts: {
  id: string;
  source: string;
  target: string;
  relation?: string;
  sourceHandle?: string;
  targetHandle?: string;
  showLabel?: boolean;
}): Edge {
  const { stroke, dashed } = relationVisual(opts.relation);
  const showLabel = opts.showLabel ?? false;
  return {
    id: opts.id,
    source: opts.source,
    target: opts.target,
    type: "default",
    ...(opts.sourceHandle ? { sourceHandle: opts.sourceHandle } : {}),
    ...(opts.targetHandle ? { targetHandle: opts.targetHandle } : {}),
    ...(showLabel && opts.relation ? { label: formatRelation(opts.relation) } : {}),
    labelStyle: { fill: "var(--dr-ink-soft, #334155)", fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: "var(--dr-surface, #ffffff)", fillOpacity: 0.9 },
    labelBgPadding: [6, 3] as [number, number],
    labelBgBorderRadius: 4,
    style: {
      stroke,
      strokeWidth: 1.7,
      ...(dashed ? { strokeDasharray: "6 4" } : {}),
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: stroke,
      width: 16,
      height: 16,
    },
  };
}

/** Static key strip rendered under a graph canvas — a colored line sample +
 *  wording per relation kind PRESENT in that graph. Lets the mind map drop
 *  per-edge labels without losing what each colored curve means. */
export function RelationLegend({ relations }: { relations: readonly string[] }) {
  const present = RELATION_LEGEND_ORDER.filter((r) => relations.includes(r));
  if (!present.length) return null;
  return (
    <div className="dr-flow-legend">
      {present.map((rel) => {
        const { stroke, dashed } = relationVisual(rel);
        return (
          <span className="dr-flow-legend-item" key={rel}>
            <span
              className={`dr-flow-legend-line${dashed ? " dr-flow-legend-line-dashed" : ""}`}
              style={{ color: stroke }}
              aria-hidden="true"
            />
            {formatRelation(rel)}
          </span>
        );
      })}
    </div>
  );
}
