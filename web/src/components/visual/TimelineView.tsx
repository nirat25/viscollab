"use client";

/**
 * TimelineView (VISUI-006) — vertical spine over the planner's pre-ordered
 * `actionIds` (already sorted by order then due; ties keep extraction order —
 * this component does not re-sort). Each entry: title, owner, due.
 */

import type { TimelineBlock } from "htmlcollab-app/visual";
import { EmptyState, pickNodes, type SemanticNodeMap } from "./shared";

export interface TimelineViewProps {
  block: TimelineBlock;
  nodes: SemanticNodeMap;
}

export default function TimelineView({ block, nodes }: TimelineViewProps) {
  const actions = pickNodes(block.actionIds, nodes, "action");

  if (!actions.length) {
    return (
      <div className="dr-card" data-visual-block-id={block.id}>
        <h3 className="dr-heading">{block.title}</h3>
        <EmptyState text="No timeline actions." />
      </div>
    );
  }

  return (
    <div className="dr-card" data-visual-block-id={block.id}>
      <h3 className="dr-heading">{block.title}</h3>
      <ol className="dr-timeline">
        {actions.map((a) => (
          <li key={a.id} className="dr-timeline-item" data-semantic-node-id={a.id}>
            <span className="dr-timeline-dot" aria-hidden="true" />
            <div className="dr-timeline-body">
              <p className="dr-timeline-title">{a.title}</p>
              <p className="dr-timeline-meta">
                {a.owner ? <span>{a.owner}</span> : null}
                {a.owner && a.due ? " · " : null}
                {a.due ? <span>{a.due}</span> : null}
                {!a.owner && !a.due ? <span>No owner or due date</span> : null}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
