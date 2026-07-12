/**
 * Deterministic visual planner (VIS-002) — SemanticArtifact → VisualPlan.
 *
 * PURE and TOTAL: never throws; degenerate input yields `{blocks: []}`.
 * Implements the emit-condition table of docs/rebuild-architecture.md §4
 * EXACTLY: fixed canonical order, omit weak blocks, never pad, never invent
 * nodeIds. Block ids are `vb_<kind>` (one block per kind in v1).
 */

import type {
  ActionNode,
  SemanticArtifact,
  SemanticNode,
  SemanticNodeId,
  SemanticRelationships,
  TradeoffNode,
} from "../semantic/types.js";
import type {
  ActionChecklistBlock,
  ArgumentMapBlock,
  DecisionBriefBlock,
  GraphEdge,
  MindMapBlock,
  OpenQuestionsBlock,
  RiskMapBlock,
  TimelineBlock,
  TradeoffCell,
  TradeoffMatrixBlock,
  VisualBlock,
  VisualPlan,
} from "./types.js";

/** Fixed human titles per block kind (brief §4). */
export const BLOCK_TITLES = {
  decisionBrief: "Decision Brief",
  mindMap: "Mind Map",
  argumentMap: "Argument Map",
  tradeoffMatrix: "Tradeoff Matrix",
  riskMap: "Risk Map",
  timeline: "Timeline",
  actionChecklist: "Action Checklist",
  openQuestions: "Open Questions",
} as const;

const RELATIONSHIP_KEYS: Array<keyof SemanticRelationships> = [
  "supports",
  "contradicts",
  "dependsOn",
  "blocks",
  "ownedBy",
];

/** All relationship edges in the artifact, in node order (deterministic). */
function collectEdges(nodes: SemanticNode[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const node of nodes) {
    if (!node.relationships) continue;
    for (const rel of RELATIONSHIP_KEYS) {
      for (const to of node.relationships[rel] ?? []) {
        edges.push({ from: node.id, to, relation: rel });
      }
    }
  }
  return edges;
}

export function planVisuals(artifact: SemanticArtifact): VisualPlan {
  const empty: VisualPlan = {
    schemaVersion: 1,
    artifactId: artifact?.id ?? "",
    blocks: [],
  };
  if (!artifact || !Array.isArray(artifact.nodes)) return empty;

  const nodes = artifact.nodes;
  const byKind = <K extends SemanticNode["kind"]>(kind: K) =>
    nodes.filter((n): n is Extract<SemanticNode, { kind: K }> => n.kind === kind);

  const decisions = byKind("decision");
  const claims = byKind("claim");
  const evidence = byKind("evidence");
  const assumptions = byKind("assumption");
  const risks = byKind("risk");
  const options = byKind("option");
  const tradeoffs = byKind("tradeoff");
  const actions = byKind("action");
  const questions = byKind("question");

  const primaryDecision =
    (artifact.primaryDecisionId
      ? decisions.find((d) => d.id === artifact.primaryDecisionId)
      : undefined) ?? decisions[0];

  const edges = collectEdges(nodes);
  const blocks: VisualBlock[] = [];

  // 1. decisionBrief — primaryDecision with non-empty question, else non-empty thesis.
  if ((primaryDecision && primaryDecision.question.trim() !== "") || artifact.thesis?.trim()) {
    const keyOptionIds = options.map((o) => o.id);
    const keyRiskIds = risks.map((r) => r.id);
    const keyActionIds = actions.map((a) => a.id);
    const block: DecisionBriefBlock = {
      id: "vb_decisionBrief",
      kind: "decisionBrief",
      title: BLOCK_TITLES.decisionBrief,
      ...(primaryDecision ? { decisionId: primaryDecision.id } : {}),
      keyOptionIds,
      keyRiskIds,
      keyActionIds,
      nodeIds: [
        ...(primaryDecision ? [primaryDecision.id] : []),
        ...keyOptionIds,
        ...keyRiskIds,
        ...keyActionIds,
      ],
    };
    blocks.push(block);
  }

  // 2. mindMap — nodes ≥ 5 AND relationship edges ≥ 3.
  if (nodes.length >= 5 && edges.length >= 3) {
    const rootId: SemanticNodeId | undefined = primaryDecision?.id ?? nodes[0]?.id;
    if (rootId) {
      const block: MindMapBlock = {
        id: "vb_mindMap",
        kind: "mindMap",
        title: BLOCK_TITLES.mindMap,
        rootId,
        edges,
        nodeIds: nodes.map((n) => n.id),
      };
      blocks.push(block);
    }
  }

  // 3. argumentMap — claims ≥ 2 AND (evidence ≥ 1 OR supports/contradicts edge exists).
  const argEdges = edges.filter(
    (e): e is ArgumentMapBlock["edges"][number] =>
      e.relation === "supports" || e.relation === "contradicts"
  );
  if (claims.length >= 2 && (evidence.length >= 1 || argEdges.length >= 1)) {
    // The map renders claims plus whatever evidence/nodes the edges touch.
    const claimIds = claims.map((c) => c.id);
    const edgeNodeIds = argEdges.flatMap((e) => [e.from, e.to]);
    const nodeIds = [...new Set([...claimIds, ...evidence.map((e) => e.id), ...edgeNodeIds])];
    const block: ArgumentMapBlock = {
      id: "vb_argumentMap",
      kind: "argumentMap",
      title: BLOCK_TITLES.argumentMap,
      claimIds,
      edges: argEdges,
      nodeIds,
    };
    blocks.push(block);
  }

  // 4. tradeoffMatrix — options ≥ 2 AND tradeoff dimensions ≥ 1.
  if (options.length >= 2 && tradeoffs.length >= 1) {
    const cells: TradeoffCell[] = [];
    for (const option of options) {
      for (const dim of tradeoffs) {
        cells.push({
          optionId: option.id,
          tradeoffId: dim.id,
          value: cellValue(option.id, dim),
        });
      }
    }
    const block: TradeoffMatrixBlock = {
      id: "vb_tradeoffMatrix",
      kind: "tradeoffMatrix",
      title: BLOCK_TITLES.tradeoffMatrix,
      optionIds: options.map((o) => o.id),
      dimensionIds: tradeoffs.map((t) => t.id),
      cells,
      nodeIds: [...options.map((o) => o.id), ...tradeoffs.map((t) => t.id)],
    };
    blocks.push(block);
  }

  // 5. riskMap — risks ≥ 2 OR (risks ≥ 1 AND assumptions ≥ 1).
  if (risks.length >= 2 || (risks.length >= 1 && assumptions.length >= 1)) {
    const block: RiskMapBlock = {
      id: "vb_riskMap",
      kind: "riskMap",
      title: BLOCK_TITLES.riskMap,
      riskIds: risks.map((r) => r.id),
      assumptionIds: assumptions.map((a) => a.id),
      nodeIds: [...risks.map((r) => r.id), ...assumptions.map((a) => a.id)],
    };
    blocks.push(block);
  }

  // 6. timeline — ≥ 2 actions carrying due or order; sorted order→due, ties keep extraction order.
  const datedActions = actions.filter((a) => a.due !== undefined || a.order !== undefined);
  if (datedActions.length >= 2) {
    const sorted = sortTimelineActions(datedActions);
    const block: TimelineBlock = {
      id: "vb_timeline",
      kind: "timeline",
      title: BLOCK_TITLES.timeline,
      actionIds: sorted.map((a) => a.id),
      nodeIds: sorted.map((a) => a.id),
    };
    blocks.push(block);
  }

  // 7. actionChecklist — actions ≥ 1 (even if timeline also emitted).
  if (actions.length >= 1) {
    const block: ActionChecklistBlock = {
      id: "vb_actionChecklist",
      kind: "actionChecklist",
      title: BLOCK_TITLES.actionChecklist,
      actionIds: actions.map((a) => a.id),
      nodeIds: actions.map((a) => a.id),
    };
    blocks.push(block);
  }

  // 8. openQuestions — questions ≥ 1.
  if (questions.length >= 1) {
    const block: OpenQuestionsBlock = {
      id: "vb_openQuestions",
      kind: "openQuestions",
      title: BLOCK_TITLES.openQuestions,
      questionIds: questions.map((q) => q.id),
      nodeIds: questions.map((q) => q.id),
    };
    blocks.push(block);
  }

  return { schemaVersion: 1, artifactId: artifact.id, blocks };
}

/**
 * Cell value for option × dimension: the dimension's summary IF the artifact
 * relates them (either direction), else "—". Values are never fabricated —
 * they only surface text the artifact already carries (brief §4 row 4).
 */
function cellValue(optionId: SemanticNodeId, dim: TradeoffNode): string {
  const rels = dim.relationships;
  const touches =
    !!rels && RELATIONSHIP_KEYS.some((k) => (rels[k] ?? []).includes(optionId));
  return touches ? dim.summary : "—";
}

/** order asc first (actions without order go last), then due lexicographic, stable. */
function sortTimelineActions(actions: ActionNode[]): ActionNode[] {
  return [...actions].sort((a, b) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    const ad = a.due ?? "";
    const bd = b.due ?? "";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return 0; // Array.prototype.sort is stable — ties keep extraction order
  });
}
