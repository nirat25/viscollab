"use client";

/**
 * RiskMap (VISUI-005) — NO xyflow (architecture brief C2: a graph reads busy
 * for this; a likelihood x impact matrix is more legible for executives).
 * A 3x3 CSS grid; risks missing EITHER field land in a separate "Unscored"
 * strip rather than being guessed onto the grid. Assumptions listed below as
 * their own quiet section.
 */

import { Fragment } from "react";
import type { RiskMapBlock } from "htmlcollab-app/visual";
import { EmptyState, pickNodes, nodeDisplayTitle, type SemanticNodeMap } from "./shared";

type Level = "low" | "medium" | "high";
const LEVELS: Level[] = ["low", "medium", "high"];

export interface RiskMapProps {
  block: RiskMapBlock;
  nodes: SemanticNodeMap;
}

export default function RiskMap({ block, nodes }: RiskMapProps) {
  const risks = pickNodes(block.riskIds, nodes, "risk");
  const assumptions = pickNodes(block.assumptionIds, nodes, "assumption");

  if (!risks.length && !assumptions.length) {
    return (
      <div className="dr-card" data-visual-block-id={block.id}>
        <h3 className="dr-heading">{block.title}</h3>
        <EmptyState text="No risks captured." />
      </div>
    );
  }

  const scored = risks.filter((r) => r.likelihood && r.impact);
  const unscored = risks.filter((r) => !r.likelihood || !r.impact);
  const cellRisks = (likelihood: Level, impact: Level) =>
    scored.filter((r) => r.likelihood === likelihood && r.impact === impact);

  return (
    <div className="dr-card" data-visual-block-id={block.id}>
      <h3 className="dr-heading">{block.title}</h3>

      <div className="dr-riskgrid" role="table" aria-label="Risks by likelihood and impact">
        <div />
        {LEVELS.map((l) => (
          <div key={`col-${l}`} className="dr-riskgrid-axis-label dr-riskgrid-col">
            {l}
          </div>
        ))}
        {[...LEVELS].reverse().map((impact) => (
          <Fragment key={`row-${impact}`}>
            <div className="dr-riskgrid-axis-label dr-riskgrid-row">{impact}</div>
            {LEVELS.map((likelihood) => (
              <div key={`${impact}-${likelihood}`} className="dr-riskgrid-cell">
                {cellRisks(likelihood, impact).map((r) => (
                  <div
                    key={r.id}
                    className="dr-risk-chip"
                    data-semantic-node-id={r.id}
                    title={r.summary}
                  >
                    {nodeDisplayTitle(r)}
                  </div>
                ))}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
      <p className="dr-axis-caption">Columns: likelihood · Rows: impact (high at top)</p>

      {unscored.length ? (
        <div className="dr-unscored">
          <p className="dr-label">Unscored</p>
          <ul className="dr-list">
            {unscored.map((r) => (
              <li key={r.id} className="dr-chip" data-semantic-node-id={r.id}>
                <span className="dr-chip-title">{nodeDisplayTitle(r)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {assumptions.length ? (
        <div className="dr-assumptions">
          <p className="dr-label">Assumptions</p>
          <ul className="dr-list">
            {assumptions.map((a) => (
              <li key={a.id} className="dr-chip" data-semantic-node-id={a.id}>
                <span className="dr-chip-title">{nodeDisplayTitle(a)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
