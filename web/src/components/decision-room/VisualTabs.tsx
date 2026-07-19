"use client";

/**
 * VisualTabs (ROOM-003) — Brief | Map | Tradeoffs | Risks | Actions | Source.
 *
 * Tab -> block mapping (brief §7.2): Brief=decisionBrief+openQuestions (inline
 * in the brief body — see project.ts, openQuestions has no TipTap node of its
 * own); Map=mindMap+argumentMap; Tradeoffs=tradeoffMatrix; Risks=riskMap;
 * Actions=timeline+actionChecklist; Source=the legacy HTML surface (always
 * enabled — it never depends on planner output).
 *
 * A tab is disabled (visible, not clickable) when the plan has NONE of its
 * mapped block kinds. Switching tabs re-projects a FILTERED plan
 * (`{...plan, blocks: plan.blocks.filter(...)}`) into a fresh
 * `SemanticArtifactEditor` — projection is pure/deterministic so this is safe;
 * the editor remounts per tab (`key={activeTab}`), which is fine since it is
 * read-only.
 *
 * This component assumes a semantic doc (`artifact`/`plan` always present).
 * DecisionRoomApp renders the legacy `DocumentSurface` directly (no tabs) for
 * docs without a `semanticArtifact` — see brief §7.2 "Legacy remains
 * reachable".
 */

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type { SemanticArtifact } from "htmlcollab-app/semantic";
import type { VisualBlockKind, VisualPlan } from "htmlcollab-app/visual";
import SemanticArtifactEditor from "@/components/tiptap/SemanticArtifactEditor";
import "@/app/decision-room.css";

export type DecisionRoomTabId =
  | "brief"
  | "map"
  | "tradeoffs"
  | "risks"
  | "actions"
  | "source";

interface TabDef {
  id: DecisionRoomTabId;
  label: string;
}

const TABS: TabDef[] = [
  { id: "brief", label: "Brief" },
  { id: "map", label: "Map" },
  { id: "tradeoffs", label: "Tradeoffs" },
  { id: "risks", label: "Risks" },
  { id: "actions", label: "Actions" },
  { id: "source", label: "Source" },
];

/** Every non-"source" tab maps to one or more VisualBlockKinds (brief §7.2). */
const TAB_BLOCK_KINDS: Record<Exclude<DecisionRoomTabId, "source">, VisualBlockKind[]> = {
  brief: ["decisionBrief", "openQuestions"],
  map: ["mindMap", "argumentMap"],
  tradeoffs: ["tradeoffMatrix"],
  risks: ["riskMap"],
  actions: ["timeline", "actionChecklist"],
};

export interface VisualTabsProps {
  artifact: SemanticArtifact;
  plan: VisualPlan;
  /** The legacy HTML review surface for THIS document, pre-built by
   *  DecisionRoomApp (same DocumentSurface props/handlers as the no-artifact
   *  path) — rendered as-is for the Source tab (brief §7.2: "the Source tab
   *  renders this same DocumentSurface path"). */
  sourceContent: ReactNode;
}

export default function VisualTabs({ artifact, plan, sourceContent }: VisualTabsProps) {
  const [activeTab, setActiveTab] = useState<DecisionRoomTabId>("brief");

  const tabEnabled = useMemo<Record<DecisionRoomTabId, boolean>>(() => {
    const enabled: Record<DecisionRoomTabId, boolean> = {
      brief: false,
      map: false,
      tradeoffs: false,
      risks: false,
      actions: false,
      source: true, // Source never depends on planner output — always enabled.
    };
    (Object.keys(TAB_BLOCK_KINDS) as Array<Exclude<DecisionRoomTabId, "source">>).forEach(
      (tabId) => {
        const kinds = TAB_BLOCK_KINDS[tabId];
        enabled[tabId] = plan.blocks.some((b) => kinds.includes(b.kind));
      }
    );
    return enabled;
  }, [plan]);

  const enabledTabs = useMemo(() => TABS.filter((tab) => tabEnabled[tab.id]), [tabEnabled]);

  // The parent keys this component by artifact id. If a plan changes under an
  // existing artifact, render the first available tab without an effect-driven
  // state repair; the next explicit keyboard/click action updates state.
  const resolvedActiveTab = tabEnabled[activeTab] ? activeTab : (enabledTabs[0]?.id ?? "source");

  const selectTab = (tabId: DecisionRoomTabId) => {
    setActiveTab(tabId);
  };

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, tabId: DecisionRoomTabId) => {
    const currentIndex = enabledTabs.findIndex((tab) => tab.id === tabId);
    if (currentIndex < 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % enabledTabs.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = enabledTabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = enabledTabs[nextIndex];
    selectTab(nextTab.id);
    requestAnimationFrame(() => document.getElementById(`dr-tab-${nextTab.id}`)?.focus());
  };

  const filteredPlan: VisualPlan | null = useMemo(() => {
    if (resolvedActiveTab === "source") return null;
    const kinds = TAB_BLOCK_KINDS[resolvedActiveTab];
    return { ...plan, blocks: plan.blocks.filter((b) => kinds.includes(b.kind)) };
  }, [plan, resolvedActiveTab]);

  return (
    <div className="dr-tabs">
      <div className="dr-tabstrip" role="tablist">
        {TABS.map((tab) => {
          const isActive = tab.id === resolvedActiveTab;
          const disabled = !tabEnabled[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`dr-tab-${tab.id}`}
              aria-selected={isActive}
              aria-disabled={disabled}
              aria-controls="decision-room-tabpanel"
              tabIndex={isActive ? 0 : -1}
              disabled={disabled}
              onClick={() => !disabled && selectTab(tab.id)}
              onKeyDown={(event) => moveTabFocus(event, tab.id)}
              className={`dr-tab ${isActive ? "dr-tab-active" : ""} ${
                disabled ? "dr-tab-disabled" : ""
              }`}
              data-testid={`decision-room-tab-${tab.id}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {resolvedActiveTab === "source" || !filteredPlan ? (
        <div className="dr-tabpanel" role="tabpanel" id="decision-room-tabpanel" aria-labelledby={`dr-tab-${resolvedActiveTab}`}>
          {sourceContent}
        </div>
      ) : (
        <div className="dr-tabpanel" role="tabpanel" id="decision-room-tabpanel" aria-labelledby={`dr-tab-${resolvedActiveTab}`}>
          <div className="pane-preview-body">
            <SemanticArtifactEditor
              key={resolvedActiveTab}
              artifact={artifact}
              plan={filteredPlan}
              includeSourceExcerpt={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
