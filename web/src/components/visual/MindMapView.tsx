"use client";

/**
 * MindMapView (VISUI-002) — @xyflow/react, read-only. Controlled nodes/edges
 * derived from `MindMapBlock` via useMemo; deterministic hand-rolled layout
 * (NO layout dependency like dagre):
 *
 *  - The graph shows ONLY the root's connected component (the reasoning
 *    actually linked to the decision), as BFS tier columns left -> right.
 *    Column pitch > card width and row pitch > card height BY CONSTRUCTION,
 *    so boxes can never overlap — and a compact canvas keeps fitView zoomed
 *    in close enough that edges, arrows, and labels stay clearly readable.
 *  - Everything else — singletons AND small satellite clusters (e.g.
 *    action -> owner pairs, which Timeline/Checklist already show) — renders
 *    as a quiet "Not linked to the decision" chip strip below the canvas
 *    (still carrying data-semantic-node-id, so Phase-7 anchoring works).
 *
 * Imported by VisualBlockNodeView via `next/dynamic { ssr:false }` (xyflow
 * touches `window`). Editing fully disabled; pan allowed, wheel scrolls the
 * page (zoom via the +/- controls) so the canvas never traps page scroll.
 */

import { useMemo } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { MindMapBlock } from "htmlcollab-app/visual";
import type { SemanticNode } from "htmlcollab-app/semantic";
import {
  EmptyState,
  FlowCardNode,
  calmEdge,
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

/** Card is a fixed 200px wide (decision-room.css) and ~2 lines tall.
 *  Pitches leave explicit gutters so overlap is impossible by construction. */
const COL_W = 290; // 200 card + 90 gutter for the edge label
const ROW_H = 110;

export interface MindMapViewProps {
  block: MindMapBlock;
  nodes: SemanticNodeMap;
}

export default function MindMapView({ block, nodes }: MindMapViewProps) {
  const { flowNodes, flowEdges, unlinked } = useMemo(
    () => buildGraph(block, nodes),
    [block, nodes]
  );

  if (!flowNodes.length && !unlinked.length) {
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
      {flowNodes.length ? (
        <div className="dr-flow-shell">
          <ReactFlowProvider>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.3}
              maxZoom={1.5}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              zoomOnScroll={false}
              preventScrolling={false}
            >
              <Background gap={20} color="var(--dr-hairline, #e2e8f0)" />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      ) : null}

      {unlinked.length ? (
        <div className="dr-unlinked">
          <p className="dr-label">Not linked to the decision</p>
          <ul className="dr-list dr-chip-row">
            {unlinked.map((n) => (
              <li
                key={n.id}
                className="dr-chip"
                data-semantic-node-id={n.id}
                title={n.summary}
              >
                <span className="dr-chip-meta">{kindLabel(n.kind)}</span>{" "}
                <span className="dr-chip-title">{nodeDisplayTitle(n)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function buildGraph(
  block: MindMapBlock,
  nodeMap: SemanticNodeMap
): { flowNodes: Node[]; flowEdges: Edge[]; unlinked: SemanticNode[] } {
  const semanticNodes = lookupNodes(block.nodeIds, nodeMap);
  if (!semanticNodes.length) return { flowNodes: [], flowEdges: [], unlinked: [] };

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

  // BFS tiers outward from the root. Whatever the BFS reaches IS the mind
  // map; everything else goes to the chip strip.
  const rootId =
    block.rootId && adjacency.has(block.rootId)
      ? block.rootId
      : semanticNodes.find((n) => adjacency.has(n.id))?.id;
  const tierOf = new Map<string, number>();
  if (rootId) {
    const queue = [rootId];
    tierOf.set(rootId, 0);
    while (queue.length) {
      const current = queue.shift()!;
      const tier = tierOf.get(current)!;
      for (const next of adjacency.get(current) ?? []) {
        if (!tierOf.has(next)) {
          tierOf.set(next, tier + 1);
          queue.push(next);
        }
      }
    }
  }

  const unlinked = semanticNodes.filter((n) => !tierOf.has(n.id));

  // Group by tier preserving nodeIds order (deterministic — matches the
  // planner's extraction-order output), columns centered vertically.
  const byTier = new Map<number, string[]>();
  for (const n of semanticNodes) {
    const tier = tierOf.get(n.id);
    if (tier === undefined) continue;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier)!.push(n.id);
  }

  const flowNodes: Node[] = [];
  for (const [tier, ids] of byTier) {
    const startY = -((ids.length - 1) * ROW_H) / 2;
    ids.forEach((id, i) => {
      const n = nodeMap.get(id);
      if (!n) return;
      const data: FlowCardData = {
        title: nodeDisplayTitle(n),
        kindText: kindLabel(n.kind),
        tint: kindTint(n.kind),
        direction: "horizontal",
        emphasis: id === rootId,
      };
      flowNodes.push({
        id,
        type: "flowCard",
        position: { x: tier * COL_W, y: startY + i * ROW_H },
        data,
        draggable: false,
        selectable: false,
      });
    });
  }

  // Only edges whose BOTH endpoints are in the graph (satellite-cluster edges
  // have no cards to connect — their nodes live in the chip strip).
  const flowEdges: Edge[] = block.edges
    .filter((e) => tierOf.has(e.from) && tierOf.has(e.to))
    .map((e, i) =>
      calmEdge({
        id: `${e.from}->${e.to}-${i}`,
        source: e.from,
        target: e.to,
        relation: e.relation,
      })
    );

  return { flowNodes, flowEdges, unlinked };
}
