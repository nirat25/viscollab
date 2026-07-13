"use client";

/**
 * VisualPreviewClient (VISUI-010) — dev-only client wrapper for /preview/visual.
 *
 * Mirrors CanvasPreview.tsx's pattern (plan client-side from the fixture) but
 * renders each of the 8 web/src/components/visual/* components DIRECTLY —
 * not through TipTap/NodeViews — so visual quality can be judged component by
 * component. Builds the same `nodes`/`recommendedOptionId`/`openQuestionsBlock`
 * props the real NodeView (VisualBlockNodeView.tsx) computes, using the same
 * planVisuals() output, so what's on screen here matches the real canvas.
 */

import dynamic from "next/dynamic";
import { useMemo, type ReactNode } from "react";
import { planVisuals, type VisualBlock, type VisualPlan } from "htmlcollab-app/visual";
import type { SemanticArtifact, SemanticNode, SemanticNodeId } from "htmlcollab-app/semantic";
import DecisionBrief from "@/components/visual/DecisionBrief";
import TradeoffMatrix from "@/components/visual/TradeoffMatrix";
import RiskMap from "@/components/visual/RiskMap";
import TimelineView from "@/components/visual/TimelineView";
import ActionChecklist from "@/components/visual/ActionChecklist";
import OpenQuestions from "@/components/visual/OpenQuestions";
import "@/app/decision-room.css";

// Same xyflow SSR guard as VisualBlockNodeView.tsx (brief R4).
const MindMapView = dynamic(() => import("@/components/visual/MindMapView"), {
  ssr: false,
});
const ArgumentMapView = dynamic(() => import("@/components/visual/ArgumentMapView"), {
  ssr: false,
});

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 44 }}>
      <header style={{ marginBottom: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 13, color: "#64748b", margin: "2px 0 0" }}>{description}</p>
      </header>
      {children}
    </section>
  );
}

function NotEmitted() {
  return (
    <p style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
      Not emitted by the planner for this fixture.
    </p>
  );
}

function blockOf<K extends VisualBlock["kind"]>(
  plan: VisualPlan,
  kind: K
): Extract<VisualBlock, { kind: K }> | undefined {
  return plan.blocks.find((b): b is Extract<VisualBlock, { kind: K }> => b.kind === kind);
}

export default function VisualPreviewClient({ artifact }: { artifact: SemanticArtifact }) {
  const plan = useMemo(() => planVisuals(artifact), [artifact]);
  const nodeMap = useMemo(
    () => new Map<SemanticNodeId, SemanticNode>(artifact.nodes.map((n) => [n.id, n])),
    [artifact]
  );

  const decisionBriefBlock = blockOf(plan, "decisionBrief");
  const mindMapBlock = blockOf(plan, "mindMap");
  const argumentMapBlock = blockOf(plan, "argumentMap");
  const tradeoffMatrixBlock = blockOf(plan, "tradeoffMatrix");
  const riskMapBlock = blockOf(plan, "riskMap");
  const timelineBlock = blockOf(plan, "timeline");
  const actionChecklistBlock = blockOf(plan, "actionChecklist");
  const openQuestionsBlock = blockOf(plan, "openQuestions");

  const primaryDecision = artifact.primaryDecisionId
    ? nodeMap.get(artifact.primaryDecisionId)
    : undefined;
  const recommendedOptionId =
    primaryDecision?.kind === "decision" ? primaryDecision.recommendedOptionId : undefined;

  return (
    <div className="decision-room-root" style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 24px 80px" }}>
        <header style={{ marginBottom: 28 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#64748b",
              margin: "0 0 4px",
            }}
          >
            Visual QA preview
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>
            {artifact.title}
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Each of the 8 visual components rendered standalone (not through TipTap) against{" "}
            <code>founder-memo.artifact.json</code> · {plan.blocks.length} planned blocks · dev
            preview only.
          </p>
        </header>

        <Section title="1. DecisionBrief" description="The Brief hero, incl. inline Open Questions.">
          {decisionBriefBlock ? (
            <DecisionBrief
              block={decisionBriefBlock}
              nodes={nodeMap}
              bluf={artifact.bluf}
              thesis={artifact.thesis}
              openQuestionsBlock={openQuestionsBlock}
            />
          ) : (
            <NotEmitted />
          )}
        </Section>

        <Section title="2. MindMapView" description="@xyflow/react, read-only, tiered layout.">
          {mindMapBlock ? <MindMapView block={mindMapBlock} nodes={nodeMap} /> : <NotEmitted />}
        </Section>

        <Section
          title="3. ArgumentMapView"
          description="@xyflow/react, read-only, layered (decision top / claims mid / evidence bottom)."
        >
          {argumentMapBlock ? (
            <ArgumentMapView block={argumentMapBlock} nodes={nodeMap} />
          ) : (
            <NotEmitted />
          )}
        </Section>

        <Section title="4. TradeoffMatrix" description="Plain HTML table, options x dimensions.">
          {tradeoffMatrixBlock ? (
            <TradeoffMatrix
              block={tradeoffMatrixBlock}
              nodes={nodeMap}
              recommendedOptionId={recommendedOptionId}
            />
          ) : (
            <NotEmitted />
          )}
        </Section>

        <Section title="5. RiskMap" description="Likelihood x impact grid (no xyflow — brief C2).">
          {riskMapBlock ? <RiskMap block={riskMapBlock} nodes={nodeMap} /> : <NotEmitted />}
        </Section>

        <Section title="6. TimelineView" description="Vertical spine, pre-ordered actions.">
          {timelineBlock ? <TimelineView block={timelineBlock} nodes={nodeMap} /> : <NotEmitted />}
        </Section>

        <Section title="7. ActionChecklist" description="Read-only checklist rows.">
          {actionChecklistBlock ? (
            <ActionChecklist block={actionChecklistBlock} nodes={nodeMap} />
          ) : (
            <NotEmitted />
          )}
        </Section>

        <Section
          title="8. OpenQuestions"
          description="Standalone rendering (in the real canvas this renders inline inside DecisionBrief)."
        >
          {openQuestionsBlock ? (
            <OpenQuestions block={openQuestionsBlock} nodes={nodeMap} />
          ) : (
            <NotEmitted />
          )}
        </Section>
      </div>
    </div>
  );
}
