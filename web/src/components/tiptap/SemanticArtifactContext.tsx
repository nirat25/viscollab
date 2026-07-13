"use client";

/**
 * SemanticArtifactContext (TIP-002) — distribution plumbing only.
 *
 * The projected TipTap doc carries IDS ONLY in node attrs (ARCH DECISION,
 * docs/rebuild-architecture.md §7.1). NodeViews resolve the full VisualBlock +
 * SemanticNodes by id from this context, so the ProseMirror doc stays tiny and
 * cannot drift from the semantic model.
 *
 * Data (`artifact`, `plan`) arrives as props to SemanticArtifactEditor and is
 * placed here; this context is NOT a data source — Phase 5 leaf components still
 * take their data as explicit props (brief §6) for isolated preview/testing.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type {
  SemanticArtifact,
  SemanticNode,
  SemanticNodeId,
} from "htmlcollab-app/semantic";
import type { VisualBlock, VisualPlan } from "htmlcollab-app/visual";

interface SemanticArtifactContextValue {
  artifact: SemanticArtifact;
  plan: VisualPlan;
  nodeMap: Map<SemanticNodeId, SemanticNode>;
  blockMap: Map<string, VisualBlock>;
}

/** What `useSemanticBlock(blockId)` resolves for a NodeView. */
export interface ResolvedSemanticBlock {
  /** The plan block, or `undefined` for the synthetic sourceExcerpt block
   *  (which has no VisualPlan entry — it is appended by `projectArtifact`). */
  block: VisualBlock | undefined;
  artifact: SemanticArtifact;
  /** Resolve one node id → node (undefined if missing/null). */
  getNode: (id: SemanticNodeId | null | undefined) => SemanticNode | undefined;
  /** Resolve many ids → nodes, dropping unknown/null ids (preserves order). */
  getNodes: (
    ids: ReadonlyArray<SemanticNodeId | null | undefined> | undefined
  ) => SemanticNode[];
}

const SemanticArtifactContext =
  createContext<SemanticArtifactContextValue | null>(null);

export function SemanticArtifactProvider({
  artifact,
  plan,
  children,
}: {
  artifact: SemanticArtifact;
  plan: VisualPlan;
  children: ReactNode;
}) {
  const value = useMemo<SemanticArtifactContextValue>(() => {
    const nodeMap = new Map<SemanticNodeId, SemanticNode>(
      artifact.nodes.map((n) => [n.id, n])
    );
    const blockMap = new Map<string, VisualBlock>(
      plan.blocks.map((b) => [b.id, b])
    );
    return { artifact, plan, nodeMap, blockMap };
  }, [artifact, plan]);

  return (
    <SemanticArtifactContext.Provider value={value}>
      {children}
    </SemanticArtifactContext.Provider>
  );
}

export function useSemanticArtifact(): SemanticArtifactContextValue {
  const ctx = useContext(SemanticArtifactContext);
  if (!ctx) {
    throw new Error(
      "useSemanticArtifact must be used inside <SemanticArtifactProvider>"
    );
  }
  return ctx;
}

/** Resolve a block + its semantic nodes by block id (for NodeViews). */
export function useSemanticBlock(blockId: string): ResolvedSemanticBlock {
  const { artifact, nodeMap, blockMap } = useSemanticArtifact();
  return useMemo<ResolvedSemanticBlock>(() => {
    const getNode = (id: SemanticNodeId | null | undefined) =>
      id ? nodeMap.get(id) : undefined;
    const getNodes = (
      ids: ReadonlyArray<SemanticNodeId | null | undefined> | undefined
    ) => (ids ?? []).map(getNode).filter((n): n is SemanticNode => Boolean(n));
    return { block: blockMap.get(blockId), artifact, getNode, getNodes };
  }, [artifact, nodeMap, blockMap, blockId]);
}
