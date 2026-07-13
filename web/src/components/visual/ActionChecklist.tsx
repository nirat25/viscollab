"use client";

/**
 * ActionChecklist (VISUI-006b) — checklist rows with READ-ONLY checkboxes
 * (`done` field; `disabled` + `readOnly`, no onChange, no mutation). Owner and
 * due are muted secondary text.
 */

import type { ActionChecklistBlock } from "htmlcollab-app/visual";
import { EmptyState, pickNodes, type SemanticNodeMap } from "./shared";

export interface ActionChecklistProps {
  block: ActionChecklistBlock;
  nodes: SemanticNodeMap;
}

export default function ActionChecklist({ block, nodes }: ActionChecklistProps) {
  const actions = pickNodes(block.actionIds, nodes, "action");

  if (!actions.length) {
    return (
      <div className="dr-card" data-visual-block-id={block.id}>
        <h3 className="dr-heading">{block.title}</h3>
        <EmptyState text="No actions captured." />
      </div>
    );
  }

  return (
    <div className="dr-card" data-visual-block-id={block.id}>
      <h3 className="dr-heading">{block.title}</h3>
      <ul className="dr-checklist">
        {actions.map((a) => (
          <li key={a.id} className="dr-checklist-row" data-semantic-node-id={a.id}>
            <input
              type="checkbox"
              checked={Boolean(a.done)}
              disabled
              readOnly
              aria-label={`${a.title} — ${a.done ? "done" : "open"}`}
            />
            <div className="dr-checklist-text">
              <span className={a.done ? "dr-checklist-title dr-checklist-done" : "dr-checklist-title"}>
                {a.title}
              </span>
              <span className="dr-checklist-meta">
                {a.owner ?? "Unassigned"}
                {a.due ? ` · due ${a.due}` : ""}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
