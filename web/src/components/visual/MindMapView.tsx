"use client";

/**
 * MindMapView (VISUI-002) — @xyflow/react, read-only. Controlled nodes/edges
 * derived from `MindMapBlock` via useMemo; deterministic hand-rolled layout
 * (NO layout dependency like dagre): BFS tiers outward from the root, root at
 * center-left, each tier a column to its right. Nodes the block's relationship
 * graph never reaches from the root (disconnected components, or singleton
 * nodes with no edges at all) land in one trailing "unconnected" column so
 * every nodeId the plan named is still rendered — never silently dropped.
 *
 * Imported by VisualBlockNodeView via `next/dynamic { ssr:false }` (xyflow
 * touches `window`). Editing fully disabled; panning/zoom allowed.
 */

import { useMemo } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { MindMapBlock } from "htmlcollab-app/visual";
import {
  EmptyState,
  FlowCardNode,
  formatRelation,
  kindLabel,
  kindTint,
  lookupNodes,
  nodeDisplayTitle,
  type FlowCardData,
  type SemanticNodeMap,
} from "./shared";
// xyflow's base stylesheet lives with the components that need it, so the
// graphs render correctly in ANY host (NodeView, /preview/visual, Phase 6
// tabs) — the bundler dedupes repeat imports.
import "@xyflow/react/dist/style.css";

const nodeTypes = { flowCard: FlowCardNode };

const COL_W = 220;
const ROW_H = 76;
/** Max rows per "Unlinked" column (review SF#3 — one tall column defeats fitView). */
const UNLINKED_COL_ROWS = 5;

export interface MindMapViewProps {
  block: MindMapBlock;
  nodes: SemanticNodeMap;
}

export default function MindMapView({ block, nodes }: MindMapViewProps) {
  const { flowNodes, flowEdges } = useMemo(() => buildGraph(block, nodes), [block, nodes]);

  if (!flowNodes.length) {
    return (
      <div className="dr-graph-block" data-visual-block-id={block.id}>
        <h3 className="dr-heading">{block.title}</h3>
        <EmptyState text="No mind map data." />
      </div>
    );
  }

  return (
    <div className="dr-graph-block" data-visual-block-id={block.id}>
      <h3 className="dr-heading">{block.title}</h3>
      <div className="dr-flow-shell">
        <ReactFlowProvider>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
          >
            <Background gap={20} color="var(--dr-hairline, #e2e8f0)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}

function buildGraph(
  block: MindMapBlock,
  nodeMap: SemanticNodeMap
): { flowNodes: Node[]; flowEdges: Edge[] } {
  const semanticNodes = lookupNodes(block.nodeIds, nodeMap);
  if (!semanticNodes.length) return { flowNodes: [], flowEdges: [] };

  // Undirected adjacency for tiering — the mind map's edges are relationship
  // edges (supports/dependsOn/ownedBy/...), not a strict hierarchy; treat
  // them as undirected purely for layout distance-from-root.
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };
  for (const e of block.edges) {
    link(e.from, e.to);
    link(e.to, e.from);
  }

  const rootId =
    block.rootId && nodeMap.has(block.rootId) ? block.rootId : semanticNodes[0].id;
  const tierOf = new Map<string, number>();
  const queue: string[] = [rootId];
  tierOf.set(rootId, 0);
  while (queue.length) {
    const current = queue.shift()!;
    const tier = tierOf.get(current) ?? 0;
    for (const next of adjacency.get(current) ?? []) {
      if (!tierOf.has(next)) {
        tierOf.set(next, tier + 1);
        queue.push(next);
      }
    }
  }
  const maxTier = Math.max(0, ...tierOf.values());
  const unconnectedTier = maxTier + 1;

  // Group nodes by tier, preserving nodeIds order within each tier
  // (deterministic — matches the planner's extraction-order output).
  const byTier = new Map<number, string[]>();
  for (const n of semanticNodes) {
    const tier = tierOf.get(n.id) ?? unconnectedTier;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier)!.push(n.id);
  }

  const flowNodes: Node[] = [];
  const pushCard = (id: string, x: number, y: number) => {
    const n = nodeMap.get(id);
    if (!n) return;
    const data: FlowCardData = {
      title: nodeDisplayTitle(n),
      kindText: kindLabel(n.kind),
      tint: kindTint(n.kind),
      direction: "horizontal",
    };
    flowNodes.push({
      id,
      type: "flowCard",
      position: { x, y },
      data,
      draggable: false,
      selectable: false,
    });
  };

  for (const [tier, ids] of byTier) {
    if (tier === unconnectedTier) continue; // handled below, chunked
    const startY = -((ids.length - 1) * ROW_H) / 2;
    ids.forEach((id, i) => pushCard(id, tier * COL_W, startY + i * ROW_H));
  }

  // Unconnected nodes: one tall column shrinks fitView until everything is
  // confetti, so chunk into short columns of UNLINKED_COL_ROWS under a small
  // "Unlinked" caption (a layout label, not a semantic node).
  const unlinked = byTier.get(unconnectedTier) ?? [];
  if (unlinked.length > 0) {
    const chunkCount = Math.ceil(unlinked.length / UNLINKED_COL_ROWS);
    const tallest = Math.min(unlinked.length, UNLINKED_COL_ROWS);
    const startY = -((tallest - 1) * ROW_H) / 2;
    flowNodes.push({
      id: "__unlinked_caption",
      type: "flowCard",
      position: { x: unconnectedTier * COL_W, y: startY - ROW_H },
      data: {
        title: "Unlinked",
        kindText: "",
        tint: "neutral",
        direction: "horizontal",
        caption: true,
      } satisfies FlowCardData,
      draggable: false,
      selectable: false,
    });
    for (let c = 0; c < chunkCount; c++) {
      const chunk = unlinked.slice(c * UNLINKED_COL_ROWS, (c + 1) * UNLINKED_COL_ROWS);
      chunk.forEach((id, i) =>
        pushCard(id, (unconnectedTier + c) * COL_W, startY + i * ROW_H)
      );
    }
  }

  const flowEdges: Edge[] = block.edges.map((e, i) => ({
    id: `${e.from}->${e.to}-${i}`,
    source: e.from,
    target: e.to,
    type: "smoothstep",
    label: formatRelation(e.relation),
    labelStyle: { fill: "var(--dr-ink-soft, #334155)", fontSize: 10 },
    labelBgStyle: { fill: "var(--dr-surface, #ffffff)" },
    style: { stroke: "var(--dr-ink-muted, #94a3b8)", strokeWidth: 1.4 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "var(--dr-ink-muted, #94a3b8)",
      width: 14,
      height: 14,
    },
  }));

  return { flowNodes, flowEdges };
}
