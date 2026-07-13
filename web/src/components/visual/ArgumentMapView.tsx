"use client";

/**
 * ArgumentMapView (VISUI-003) — @xyflow/react, read-only. Layered layout:
 * decision/thesis top row, claims mid row, evidence bottom row (any
 * unexpected kind falls back to the mid row). `supports` edges render solid;
 * `contradicts` edges render dashed with the calm negative tint.
 *
 * Imported by VisualBlockNodeView via `next/dynamic { ssr:false }`. Editing
 * fully disabled; panning/zoom allowed.
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
import type { ArgumentMapBlock } from "htmlcollab-app/visual";
import type { SemanticNodeKind } from "htmlcollab-app/semantic";
// xyflow's base stylesheet lives with the components that need it, so the
// graphs render correctly in ANY host (the bundler dedupes repeat imports).
import "@xyflow/react/dist/style.css";
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

const nodeTypes = { flowCard: FlowCardNode };

/** Card is a fixed 200px wide (decision-room.css); pitches leave explicit
 *  gutters so cards can never overlap and edge labels have room. */
const COL_W = 260;
const ROW_H = 190;

export interface ArgumentMapViewProps {
  block: ArgumentMapBlock;
  nodes: SemanticNodeMap;
}

export default function ArgumentMapView({ block, nodes }: ArgumentMapViewProps) {
  const { flowNodes, flowEdges } = useMemo(() => buildGraph(block, nodes), [block, nodes]);

  if (!flowNodes.length) {
    return (
      <div className="dr-graph-block" data-visual-block-id={block.id}>
        <h3 className="dr-heading">{block.title}</h3>
        <EmptyState text="No argument map data." />
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
    </div>
  );
}

/** decision/thesis top, claims mid, evidence bottom (brief §6 row spec). */
function rowFor(kind: SemanticNodeKind): number {
  if (kind === "decision") return 0;
  if (kind === "evidence") return 2;
  return 1; // claim, plus any unexpected kind, in the mid row.
}

function buildGraph(
  block: ArgumentMapBlock,
  nodeMap: SemanticNodeMap
): { flowNodes: Node[]; flowEdges: Edge[] } {
  const semanticNodes = lookupNodes(block.nodeIds, nodeMap);
  if (!semanticNodes.length) return { flowNodes: [], flowEdges: [] };

  const rows = new Map<number, string[]>();
  for (const n of semanticNodes) {
    const row = rowFor(n.kind);
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)!.push(n.id);
  }

  const flowNodes: Node[] = [];
  for (const [row, ids] of rows) {
    const startX = -((ids.length - 1) * COL_W) / 2;
    ids.forEach((id, i) => {
      const n = nodeMap.get(id);
      if (!n) return;
      const data: FlowCardData = {
        title: nodeDisplayTitle(n),
        kindText: kindLabel(n.kind),
        tint: kindTint(n.kind),
        direction: "vertical",
        emphasis: n.kind === "decision",
      };
      flowNodes.push({
        id,
        type: "flowCard",
        position: { x: startX + i * COL_W, y: row * ROW_H },
        data,
        draggable: false,
        selectable: false,
      });
    });
  }

  const flowEdges: Edge[] = block.edges.map((e, i) =>
    calmEdge({
      id: `${e.from}->${e.to}-${i}`,
      source: e.from,
      target: e.to,
      relation: e.relation,
      negative: e.relation === "contradicts",
    })
  );

  return { flowNodes, flowEdges };
}
