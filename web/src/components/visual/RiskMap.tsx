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

      <div className="dr-riskgrid" aria-label="Risks by likelihood and impact">
        {/* Row 1: likelihood axis title over the three columns */}
        <div className="dr-riskgrid-corner" />
        <div className="dr-riskgrid-axis-title dr-likelihood">Likelihood</div>
        {/* Row 2: column headers */}
        <div className="dr-riskgrid-corner" />
        {LEVELS.map((l) => (
          <div key={`col-${l}`} className="dr-riskgrid-axis-label dr-riskgrid-col">
            {l}
          </div>
        ))}
        {/* Rows 3-5: rotated impact title (spans all rows) + row label + cells */}
        {[...LEVELS].reverse().map((impact, rowIdx) => (
          <Fragment key={`row-${impact}`}>
            {rowIdx === 0 ? (
              <div className="dr-riskgrid-axis-title dr-impact">Impact</div>
            ) : null}
            <div className="dr-riskgrid-axis-label dr-riskgrid-row">{impact}</div>
            {LEVELS.map((likelihood) => {
              const severity = LEVELS.indexOf(likelihood) + LEVELS.indexOf(impact);
              return (
                <div
                  key={`${impact}-${likelihood}`}
                  className={`dr-riskgrid-cell dr-sev-${severity}`}
                >
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
              );
            })}
          </Fragment>
        ))}
      </div>

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
