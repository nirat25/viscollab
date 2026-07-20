"use client";

/**
 * TopDecisionBar (ROOM-002) — room title + BLUF + Decision status.
 *
 * REPLACES the old "Alignment Sign-off Verdicts" banner (brief §7.2, §10
 * vocabulary: "Decision status" is the exact UI string). Same underlying
 * data/behavior as before: one verdict chip per known reviewer (from the
 * `verdicts` record) plus a select bound to the CURRENT user's own verdict —
 * `data-testid="verdict-select"` is preserved for existing test coverage.
 *
 * Presentational only: props in, one callback out (`onVerdictChange`).
 */

import { UserCheck } from "lucide-react";
import "@/app/decision-room.css";

export type DecisionVerdict = "approve" | "changes" | "block" | null;

export interface TopDecisionBarProps {
  /** Room title: `artifact.title` for semantic docs, the document name for
   *  legacy docs (no artifact). */
  title: string;
  /** Artifact BLUF — omitted entirely for legacy docs (no artifact). */
  bluf?: string;
  verdicts: Record<string, DecisionVerdict>;
  currentUserName: string;
  onVerdictChange: (val: DecisionVerdict) => void;
  canSetVerdict: boolean;
}

const VERDICT_LABEL: Record<Exclude<DecisionVerdict, null>, string> = {
  approve: "Approved",
  changes: "Request Changes",
  block: "Blocked",
};

export default function TopDecisionBar({
  title,
  bluf,
  verdicts,
  currentUserName,
  onVerdictChange,
  canSetVerdict,
}: TopDecisionBarProps) {
  return (
    <div className="dr-topbar">
      <div className="dr-topbar-room">
        <h2 className="dr-topbar-title">{title}</h2>
        {bluf ? <p className="dr-topbar-bluf">{bluf}</p> : null}
      </div>

      <div className="dr-topbar-status">
        <div>
          <div className="dr-topbar-status-header">
            <UserCheck size={13} />
            <span>Decision status</span>
          </div>
          <div className="dr-chip-row">
            {Object.entries(verdicts).map(([user, verdict]) => (
              <span
                key={user}
                className={`dr-verdict-chip dr-verdict-${verdict ?? "pending"}`}
              >
                <span className="dr-verdict-dot" />
                {user}: {verdict ? VERDICT_LABEL[verdict] : "Pending"}
              </span>
            ))}
          </div>
        </div>

        {canSetVerdict && <label className="dr-verdict-select-wrap">
          <span className="dr-label">Your verdict</span>
          <select
            value={verdicts[currentUserName] || ""}
            onChange={(e) =>
              onVerdictChange((e.target.value || null) as DecisionVerdict)
            }
            data-testid="verdict-select"
            className="dr-select"
          >
            <option value="">Pending...</option>
            <option value="approve">Approve</option>
            <option value="changes">Request Changes</option>
            <option value="block">Block</option>
          </select>
        </label>}
      </div>
    </div>
  );
}
