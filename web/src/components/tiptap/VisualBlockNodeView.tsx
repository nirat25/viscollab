"use client";

/**
 * VisualBlockNodeView (TIP-003/004; swapped in Phase 5 — VISUI) — the
 * read-only React NodeView rendered for every custom TipTap block node.
 *
 * The NodeView's job shrank to id resolution + wiring: it resolves the block
 * + a full node lookup Map from SemanticArtifactContext and hands them down
 * as PROPS to the real `web/src/components/visual/*` leaf components (brief
 * §6 — leaf components take data as props and read nothing from context, so
 * they stay unit/preview-testable in isolation). `data-visual-block-id` /
 * `data-block-kind` stay on the NodeViewWrapper; each leaf component now owns
 * its own surface/chrome, so the wrapper no longer draws a card around it
 * (avoids double card-in-card borders).
 *
 * `sourceExcerptBlock` keeps its Phase-4 placeholder body verbatim (moved
 * into its own card wrapper since the NodeViewWrapper no longer supplies
 * one) — Source tab work is Phase 6.
 */

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import dynamic from "next/dynamic";
import type { CSSProperties, FC } from "react";
import type { OpenQuestionsBlock } from "htmlcollab-app/visual";
import {
  useSemanticArtifact,
  useSemanticBlock,
  type ResolvedSemanticBlock,
} from "./SemanticArtifactContext";
import DecisionBrief from "@/components/visual/DecisionBrief";
import TradeoffMatrix from "@/components/visual/TradeoffMatrix";
import RiskMap from "@/components/visual/RiskMap";
import TimelineView from "@/components/visual/TimelineView";
import ActionChecklist from "@/components/visual/ActionChecklist";
import type { SemanticNodeMap } from "@/components/visual/shared";

// xyflow touches `window` (brief R4) — MindMap/ArgumentMap load client-only,
// never server-rendered, same pattern as CompatSmoke's bare <ReactFlow/>.
const MindMapView = dynamic(() => import("@/components/visual/MindMapView"), {
  ssr: false,
});
const ArgumentMapView = dynamic(() => import("@/components/visual/ArgumentMapView"), {
  ssr: false,
});

/* ---- calm light tokens — retained only for the Phase-4 sourceExcerpt body
   and the defensive "unknown kind" fallback. Every other kind now renders its
   own surface via web/src/components/visual/* + decision-room.css. ---- */
const S = {
  card: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: "16px 18px",
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
  meta: { fontSize: 13, color: "#475569", margin: "2px 0" } as CSSProperties,
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

function Empty({ text }: { text: string }) {
  return <p style={S.empty}>{text}</p>;
}

interface BodyProps {
  resolve: ResolvedSemanticBlock;
  primaryNodeId: string | null;
  nodeMap: SemanticNodeMap;
  openQuestionsBlock: OpenQuestionsBlock | undefined;
}

/* --------------------------- kind -> body adapters --------------------------- */

const DecisionBriefBody: FC<BodyProps> = ({ resolve, nodeMap, openQuestionsBlock }) => {
  const { block, artifact } = resolve;
  if (block?.kind !== "decisionBrief") return <Empty text="No decision brief." />;
  return (
    <DecisionBrief
      block={block}
      nodes={nodeMap}
      bluf={artifact.bluf}
      thesis={artifact.thesis}
      openQuestionsBlock={openQuestionsBlock}
    />
  );
};

const MindMapBody: FC<BodyProps> = ({ resolve, nodeMap }) => {
  const { block } = resolve;
  if (block?.kind !== "mindMap") return <Empty text="No mind map." />;
  return <MindMapView block={block} nodes={nodeMap} />;
};

const ArgumentMapBody: FC<BodyProps> = ({ resolve, nodeMap }) => {
  const { block } = resolve;
  if (block?.kind !== "argumentMap") return <Empty text="No argument map." />;
  return <ArgumentMapView block={block} nodes={nodeMap} />;
};

const TradeoffMatrixBody: FC<BodyProps> = ({ resolve, nodeMap }) => {
  const { block, artifact, getNode } = resolve;
  if (block?.kind !== "tradeoffMatrix") return <Empty text="No tradeoffs." />;
  const decision = getNode(artifact.primaryDecisionId);
  const recommendedOptionId =
    decision?.kind === "decision" ? decision.recommendedOptionId : undefined;
  return (
    <TradeoffMatrix block={block} nodes={nodeMap} recommendedOptionId={recommendedOptionId} />
  );
};

const RiskMapBody: FC<BodyProps> = ({ resolve, nodeMap }) => {
  const { block } = resolve;
  if (block?.kind !== "riskMap") return <Empty text="No risks." />;
  return <RiskMap block={block} nodes={nodeMap} />;
};

const TimelineBody: FC<BodyProps> = ({ resolve, nodeMap }) => {
  const { block } = resolve;
  if (block?.kind !== "timeline") return <Empty text="No timeline." />;
  return <TimelineView block={block} nodes={nodeMap} />;
};

const ActionChecklistBody: FC<BodyProps> = ({ resolve, nodeMap }) => {
  const { block } = resolve;
  if (block?.kind !== "actionChecklist") return <Empty text="No actions." />;
  return <ActionChecklist block={block} nodes={nodeMap} />;
};

/** Phase-4 placeholder body, unchanged content/logic — now owns its own card
 *  chrome since the wrapper no longer supplies one. Source tab is Phase 6. */
const SourceExcerptBody: FC<BodyProps> = ({ resolve, primaryNodeId }) => {
  const { getNode } = resolve;
  const node = getNode(primaryNodeId);
  const quote = node?.sourceRefs?.[0]?.quote;
  if (!node) {
    return (
      <div style={S.card}>
        <div style={S.header}>
          <h3 style={S.title}>Source Excerpt</h3>
          <span style={S.badge}>sourceExcerpt</span>
        </div>
        <Empty text="No source excerpt." />
      </div>
    );
  }
  return (
    <div style={S.card} data-semantic-node-id={node.id}>
      <div style={S.header}>
        <h3 style={S.title}>Source Excerpt</h3>
        <span style={S.badge}>sourceExcerpt</span>
      </div>
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

/** blockKind → body. Every real kind now renders its light-executive
 *  `web/src/components/visual/*` component; sourceExcerpt keeps its Phase-4
 *  placeholder card (Source tab work is Phase 6). */
const BLOCK_BODIES: Record<string, FC<BodyProps>> = {
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
  const { nodeMap, blockMap } = useSemanticArtifact();
  // Find by KIND, not by the planner's id scheme ("vb_openQuestions") — a
  // plan.ts id change must not silently drop the inline questions (review SF#4).
  let openQuestionsBlock: OpenQuestionsBlock | undefined;
  for (const b of blockMap.values()) {
    if (b.kind === "openQuestions") {
      openQuestionsBlock = b;
      break;
    }
  }

  const Body = BLOCK_BODIES[blockKind];
  const title = resolve.block?.title ?? KIND_TITLE_FALLBACK[blockKind] ?? blockKind;

  return (
    <NodeViewWrapper
      data-visual-block-id={blockId}
      data-block-kind={blockKind}
      contentEditable={false}
      style={{ display: "block", margin: "20px 0" }}
    >
      {Body ? (
        <Body
          resolve={resolve}
          primaryNodeId={primaryNodeId}
          nodeMap={nodeMap}
          openQuestionsBlock={openQuestionsBlock}
        />
      ) : (
        <div style={S.card}>
          <div style={S.header}>
            <h3 style={S.title}>{title}</h3>
            <span style={S.badge}>{blockKind}</span>
          </div>
          <Empty text={`Unknown block kind: ${blockKind}`} />
        </div>
      )}
    </NodeViewWrapper>
  );
}
