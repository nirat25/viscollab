"use client";

/**
 * DecisionBrief (VISUI-001) — the Brief hero: BLUF line, the decision
 * question prominent, recommended option highlighted, key risks/actions as
 * calm chips, sourceStatus as a subtle grounding badge. Degrades to a
 * thesis-only brief when the planner emitted no decision (brief §4 row 1).
 *
 * Props in, nothing fetched — `nodes` is the full artifact node lookup handed
 * down by the NodeView (or built once in the preview route).
 */

import type { DecisionBriefBlock, OpenQuestionsBlock } from "htmlcollab-app/visual";
import { EmptyState, nodeDisplayTitle, pickNodes, type SemanticNodeMap } from "./shared";
import OpenQuestions from "./OpenQuestions";

export interface DecisionBriefProps {
  block: DecisionBriefBlock;
  nodes: SemanticNodeMap;
  /** Artifact-level BLUF (one-sentence bottom-line-up-front). */
  bluf?: string;
  /** Fallback lede when the planner emitted no decision node. */
  thesis?: string;
  /** The Open Questions block, if the planner emitted one — rendered inline
   *  at the end (architecture §7.1: openQuestions has no TipTap node of its
   *  own; it lives inside the Brief). */
  openQuestionsBlock?: OpenQuestionsBlock;
}

const SOURCE_STATUS_LABEL: Record<string, string> = {
  explicit: "Grounded in source",
  inferred: "Inferred from source",
  missing_evidence: "No supporting evidence found",
};

export default function DecisionBrief({
  block,
  nodes,
  bluf,
  thesis,
  openQuestionsBlock,
}: DecisionBriefProps) {
  const decisionNode = block.decisionId ? nodes.get(block.decisionId) : undefined;
  const decision = decisionNode?.kind === "decision" ? decisionNode : undefined;

  const options = pickNodes(block.keyOptionIds, nodes, "option");
  const risks = pickNodes(block.keyRiskIds, nodes, "risk");
  const actions = pickNodes(block.keyActionIds, nodes, "action");

  const hasContent = Boolean(decision || bluf || thesis);
  if (!hasContent) {
    return <EmptyState text="No decision brief available." />;
  }

  const recommendedOptionId = decision?.recommendedOptionId;
  const groundingLabel = decision ? SOURCE_STATUS_LABEL[decision.sourceStatus] : undefined;

  return (
    <div className="dr-brief" data-visual-block-id={block.id}>
      <h3 className="dr-heading">{block.title}</h3>

      {bluf ? <p className="dr-brief-bluf">{bluf}</p> : null}

      {decision ? (
        <div className="dr-brief-decision" data-semantic-node-id={decision.id}>
          <p className="dr-eyebrow">Decision</p>
          <p className="dr-brief-question">{decision.question}</p>
          {groundingLabel ? <span className="dr-grounding-badge">{groundingLabel}</span> : null}
        </div>
      ) : thesis ? (
        <p className="dr-brief-thesis">{thesis}</p>
      ) : null}

      {options.length ? (
        <div className="dr-brief-section">
          <p className="dr-label">Options</p>
          <ul className="dr-chip-row">
            {options.map((o) => (
              <li
                key={o.id}
                className={
                  o.id === recommendedOptionId ? "dr-chip dr-chip-recommended" : "dr-chip"
                }
                data-semantic-node-id={o.id}
              >
                {o.id === recommendedOptionId ? (
                  <span className="dr-tag-recommended">Recommended</span>
                ) : null}
                <span className="dr-chip-title">{nodeDisplayTitle(o)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {risks.length ? (
        <div className="dr-brief-section">
          <p className="dr-label">Key risks</p>
          <ul className="dr-chip-row">
            {risks.map((r) => (
              <li key={r.id} className="dr-chip dr-chip-risk" data-semantic-node-id={r.id}>
                <span className="dr-chip-title">{nodeDisplayTitle(r)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {actions.length ? (
        <div className="dr-brief-section">
          <p className="dr-label">Key actions</p>
          <ul className="dr-chip-row">
            {actions.map((a) => (
              <li key={a.id} className="dr-chip" data-semantic-node-id={a.id}>
                <span className="dr-chip-title">{a.title}</span>
                {a.owner ? <span className="dr-chip-meta"> — {a.owner}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {openQuestionsBlock ? (
        <div className="dr-brief-questions">
          <OpenQuestions block={openQuestionsBlock} nodes={nodes} />
        </div>
      ) : null}
    </div>
  );
}
