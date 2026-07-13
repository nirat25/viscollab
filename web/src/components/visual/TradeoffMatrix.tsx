"use client";

/**
 * TradeoffMatrix (VISUI-004) — plain HTML <table>: options as rows,
 * dimensions as columns, cell value text. `sentiment` -> subtle TEXT color
 * only (never a cell fill). Empty cells ("—", the planner never fabricates a
 * value) render muted. Row header = option title (+ "Recommended" tag if it
 * matches the decision's `recommendedOptionId`, passed in as a prop).
 */

import type { TradeoffMatrixBlock } from "htmlcollab-app/visual";
import type { SemanticNodeId } from "htmlcollab-app/semantic";
import { EmptyState, nodeDisplayTitle, pickNodes, type SemanticNodeMap } from "./shared";

export interface TradeoffMatrixProps {
  block: TradeoffMatrixBlock;
  nodes: SemanticNodeMap;
  recommendedOptionId?: SemanticNodeId;
}

export default function TradeoffMatrix({
  block,
  nodes,
  recommendedOptionId,
}: TradeoffMatrixProps) {
  const options = pickNodes(block.optionIds, nodes, "option");
  const dimensions = pickNodes(block.dimensionIds, nodes, "tradeoff");

  if (!options.length || !dimensions.length) {
    return (
      <div className="dr-card" data-visual-block-id={block.id}>
        <h3 className="dr-heading">{block.title}</h3>
        <EmptyState text="No tradeoffs to compare." />
      </div>
    );
  }

  const cellFor = (optionId: string, dimId: string) =>
    block.cells.find((c) => c.optionId === optionId && c.tradeoffId === dimId);

  return (
    <div className="dr-card" data-visual-block-id={block.id}>
      <h3 className="dr-heading">{block.title}</h3>
      <div className="dr-table-scroll">
        <table className="dr-table">
          <thead>
            <tr>
              <th scope="col">Option</th>
              {dimensions.map((d) => (
                <th key={d.id} scope="col" data-semantic-node-id={d.id}>
                  {d.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {options.map((o) => (
              <tr key={o.id}>
                <th scope="row" data-semantic-node-id={o.id}>
                  {nodeDisplayTitle(o)}
                  {o.id === recommendedOptionId ? (
                    <span className="dr-tag-recommended" style={{ marginLeft: 8 }}>
                      Recommended
                    </span>
                  ) : null}
                </th>
                {dimensions.map((d) => {
                  const cell = cellFor(o.id, d.id);
                  const value = cell?.value ?? "—";
                  const isEmpty = value === "—";
                  const sentimentClass = cell?.sentiment ? `dr-sentiment-${cell.sentiment}` : "";
                  return (
                    <td key={d.id} className={isEmpty ? "dr-cell-empty" : sentimentClass}>
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
