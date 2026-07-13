"use client";

/**
 * VisualBlockNodeView (TIP-003/004) — the read-only React NodeView rendered for
 * every custom TipTap block node.
 *
 * Phase 4 renders honest PLACEHOLDER cards (calm light surface, hairline border,
 * ink text — no gradient/glass/glow/dark). It surfaces ONLY facts that exist in
 * the artifact; nothing is invented.
 *
 * PHASE 5 SWAP POINT — `PLACEHOLDER_BODIES` maps blockKind → body component.
 * Replace one entry per kind with the real `web/src/components/visual/*`
 * component (DecisionBrief, MindMapView, …). The card chrome, id resolution,
 * `data-visual-block-id`, and `data-semantic-node-id` contract stay put; the
 * swap is a one-line substitution per kind.
 *
 * Every element representing a semantic node carries `data-semantic-node-id`
 * (Phase 7 anchors comment cards to visual nodes by querying this attribute);
 * the block root carries `data-visual-block-id` + `data-block-kind`.
 */

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import type { CSSProperties, FC, ReactNode } from "react";
import type {
  ActionNode,
  RiskNode,
  SemanticNode,
} from "htmlcollab-app/semantic";
import {
  useSemanticBlock,
  type ResolvedSemanticBlock,
} from "./SemanticArtifactContext";

/* ---- calm light tokens (Phase 4 placeholders; Phase 5 owns decision-room.css) ---- */
const S = {
  card: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: "16px 18px",
    margin: "12px 0",
    color: "#0f172a",
  } as CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  } as CSSProperties,
  title: { fontSize: 16, fontWeight: 600, margin: 0, color: "#0f172a" } as CSSProperties,
  badge: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#475569",
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    borderRadius: 999,
    padding: "2px 8px",
    whiteSpace: "nowrap",
  } as CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    margin: "12px 0 4px",
  } as CSSProperties,
  bluf: { fontSize: 14, color: "#0f172a", margin: "0 0 4px", lineHeight: 1.5 } as CSSProperties,
  question: { fontSize: 14, fontWeight: 600, color: "#0f172a", margin: "0 0 4px" } as CSSProperties,
  meta: { fontSize: 13, color: "#475569", margin: "2px 0" } as CSSProperties,
  list: { listStyle: "none", margin: "4px 0 0", padding: 0, display: "grid", gap: 4 } as CSSProperties,
  chip: {
    fontSize: 13,
    color: "#0f172a",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "6px 10px",
    lineHeight: 1.4,
  } as CSSProperties,
  chipMeta: { color: "#64748b", fontWeight: 400 } as CSSProperties,
  empty: { fontSize: 13, color: "#94a3b8", fontStyle: "italic", margin: 0 } as CSSProperties,
};

const KIND_TITLE_FALLBACK: Record<string, string> = {
  decisionBrief: "Decision Brief",
  mindMap: "Mind Map",
  argumentMap: "Argument Map",
  tradeoffMatrix: "Tradeoff Matrix",
  riskMap: "Risk Map",
  timeline: "Timeline",
  actionChecklist: "Action Checklist",
  sourceExcerpt: "Source Excerpt",
};

/** A semantic node rendered as a chip — carries the required data-semantic-node-id. */
function NodeChip({ node, meta }: { node: SemanticNode; meta?: ReactNode }) {
  return (
    <li data-semantic-node-id={node.id} style={S.chip}>
      <span style={{ fontWeight: 600 }}>
        {node.label ? `${node.label}: ` : ""}
        {node.title}
      </span>
      {meta ? <span style={S.chipMeta}> — {meta}</span> : null}
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={S.empty}>{text}</p>;
}

interface BodyProps {
  resolve: ResolvedSemanticBlock;
  primaryNodeId: string | null;
}

/* ------------------------------- placeholders ------------------------------- */

const DecisionBriefBody: FC<BodyProps> = ({ resolve }) => {
  const { block, artifact, getNode, getNodes } = resolve;
  if (block?.kind !== "decisionBrief") return <Empty text="No decision brief." />;
  const decision = getNode(block.decisionId);
  const options = getNodes(block.keyOptionIds);
  const risks = getNodes(block.keyRiskIds);
  const actions = getNodes(block.keyActionIds);
  return (
    <div>
      {decision && decision.kind === "decision" ? (
        <p data-semantic-node-id={decision.id} style={S.question}>
          {decision.question}
        </p>
      ) : null}
      {artifact.bluf ? <p style={S.bluf}>{artifact.bluf}</p> : null}
      <p style={S.meta}>
        {options.length} option{options.length === 1 ? "" : "s"} · {risks.length} risk
        {risks.length === 1 ? "" : "s"} · {actions.length} action
        {actions.length === 1 ? "" : "s"}
      </p>
      {options.length ? (
        <>
          <p style={S.label}>Options</p>
          <ul style={S.list}>
            {options.map((n) => (
              <NodeChip key={n.id} node={n} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
};

const MindMapBody: FC<BodyProps> = ({ resolve }) => {
  const { block, getNode, getNodes } = resolve;
  if (block?.kind !== "mindMap") return <Empty text="No mind map." />;
  const root = getNode(block.rootId);
  const nodes = getNodes(block.nodeIds);
  return (
    <div>
      {root ? (
        <p style={S.meta}>
          Root:{" "}
          <span data-semantic-node-id={root.id} style={{ fontWeight: 600 }}>
            {root.title}
          </span>
        </p>
      ) : null}
      <p style={S.meta}>
        {nodes.length} node{nodes.length === 1 ? "" : "s"} · {block.edges.length} relationship
        {block.edges.length === 1 ? "" : "s"}
      </p>
      <ul style={S.list}>
        {nodes.map((n) => (
          <NodeChip key={n.id} node={n} meta={n.kind} />
        ))}
      </ul>
    </div>
  );
};

const ArgumentMapBody: FC<BodyProps> = ({ resolve }) => {
  const { block, getNodes } = resolve;
  if (block?.kind !== "argumentMap") return <Empty text="No argument map." />;
  const claims = getNodes(block.claimIds);
  return (
    <div>
      <p style={S.meta}>
        {claims.length} claim{claims.length === 1 ? "" : "s"} · {block.edges.length} edge
        {block.edges.length === 1 ? "" : "s"}
      </p>
      <ul style={S.list}>
        {claims.map((n) => (
          <NodeChip key={n.id} node={n} />
        ))}
      </ul>
    </div>
  );
};

const TradeoffMatrixBody: FC<BodyProps> = ({ resolve }) => {
  const { block, getNodes } = resolve;
  if (block?.kind !== "tradeoffMatrix") return <Empty text="No tradeoffs." />;
  const options = getNodes(block.optionIds);
  const dims = getNodes(block.dimensionIds);
  return (
    <div>
      <p style={S.meta}>
        {options.length} option{options.length === 1 ? "" : "s"} × {dims.length} dimension
        {dims.length === 1 ? "" : "s"}
      </p>
      {options.length ? (
        <>
          <p style={S.label}>Options</p>
          <ul style={S.list}>
            {options.map((n) => (
              <NodeChip key={n.id} node={n} />
            ))}
          </ul>
        </>
      ) : null}
      {dims.length ? (
        <>
          <p style={S.label}>Dimensions</p>
          <ul style={S.list}>
            {dims.map((n) => (
              <NodeChip key={n.id} node={n} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
};

const RiskMapBody: FC<BodyProps> = ({ resolve }) => {
  const { block, getNodes } = resolve;
  if (block?.kind !== "riskMap") return <Empty text="No risks." />;
  const risks = getNodes(block.riskIds) as RiskNode[];
  const assumptions = getNodes(block.assumptionIds);
  const grade = (r: RiskNode) =>
    [r.likelihood ? `likelihood ${r.likelihood}` : null, r.impact ? `impact ${r.impact}` : null]
      .filter(Boolean)
      .join(" · ") || "unscored";
  return (
    <div>
      {risks.length ? (
        <>
          <p style={S.label}>Risks</p>
          <ul style={S.list}>
            {risks.map((r) => (
              <NodeChip key={r.id} node={r} meta={grade(r)} />
            ))}
          </ul>
        </>
      ) : null}
      {assumptions.length ? (
        <>
          <p style={S.label}>Assumptions</p>
          <ul style={S.list}>
            {assumptions.map((n) => (
              <NodeChip key={n.id} node={n} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
};

function actionMeta(a: ActionNode): string {
  return [a.owner ? `owner ${a.owner}` : null, a.due ? `due ${a.due}` : null]
    .filter(Boolean)
    .join(" · ");
}

const TimelineBody: FC<BodyProps> = ({ resolve }) => {
  const { block, getNodes } = resolve;
  if (block?.kind !== "timeline") return <Empty text="No timeline." />;
  const actions = getNodes(block.actionIds) as ActionNode[];
  return (
    <ul style={S.list}>
      {actions.map((a) => (
        <NodeChip key={a.id} node={a} meta={actionMeta(a) || undefined} />
      ))}
    </ul>
  );
};

const ActionChecklistBody: FC<BodyProps> = ({ resolve }) => {
  const { block, getNodes } = resolve;
  if (block?.kind !== "actionChecklist") return <Empty text="No actions." />;
  const actions = getNodes(block.actionIds) as ActionNode[];
  return (
    <ul style={S.list}>
      {actions.map((a) => (
        <NodeChip
          key={a.id}
          node={a}
          meta={[a.done ? "done" : "open", actionMeta(a)].filter(Boolean).join(" · ")}
        />
      ))}
    </ul>
  );
};

const SourceExcerptBody: FC<BodyProps> = ({ resolve, primaryNodeId }) => {
  const { getNode } = resolve;
  const node = getNode(primaryNodeId);
  const quote = node?.sourceRefs?.[0]?.quote;
  if (!node) return <Empty text="No source excerpt." />;
  return (
    <div data-semantic-node-id={node.id}>
      <p style={S.meta}>
        <span style={{ fontWeight: 600 }}>{node.title}</span>
      </p>
      {quote ? (
        <blockquote
          style={{
            margin: "6px 0 0",
            padding: "8px 12px",
            borderLeft: "3px solid #cbd5e1",
            color: "#334155",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          {quote}
        </blockquote>
      ) : (
        <Empty text="No source quote." />
      )}
    </div>
  );
};

/** blockKind → placeholder body. PHASE 5: swap each value for the real component. */
const PLACEHOLDER_BODIES: Record<string, FC<BodyProps>> = {
  decisionBrief: DecisionBriefBody,
  mindMap: MindMapBody,
  argumentMap: ArgumentMapBody,
  tradeoffMatrix: TradeoffMatrixBody,
  riskMap: RiskMapBody,
  timeline: TimelineBody,
  actionChecklist: ActionChecklistBody,
  sourceExcerpt: SourceExcerptBody,
};

export default function VisualBlockNodeView({ node }: NodeViewProps) {
  const blockId = String(node.attrs.blockId ?? "");
  const blockKind = String(node.attrs.blockKind ?? "");
  const primaryNodeId =
    node.attrs.primaryNodeId != null ? String(node.attrs.primaryNodeId) : null;

  const resolve = useSemanticBlock(blockId);
  const Body = PLACEHOLDER_BODIES[blockKind];
  const title = resolve.block?.title ?? KIND_TITLE_FALLBACK[blockKind] ?? blockKind;

  return (
    <NodeViewWrapper
      data-visual-block-id={blockId}
      data-block-kind={blockKind}
      contentEditable={false}
      style={S.card}
    >
      <div style={S.header}>
        <h3 style={S.title}>{title}</h3>
        <span style={S.badge}>{blockKind}</span>
      </div>
      {Body ? (
        <Body resolve={resolve} primaryNodeId={primaryNodeId} />
      ) : (
        <Empty text={`Unknown block kind: ${blockKind}`} />
      )}
    </NodeViewWrapper>
  );
}
