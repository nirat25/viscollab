/** Deterministic legacy blob -> V2 projection. It deliberately never extracts semantics. */

import type { Comment, Verdict } from "../collab/comments.js";
import { validateSemanticArtifact } from "../semantic/schema.js";
import type { SemanticArtifact } from "../semantic/types.js";
import { planVisuals } from "../visual/plan.js";
import { validateVisualPlan } from "../visual/validate.js";
import type { VisualPlan } from "../visual/types.js";
import type { DocumentStateV2, DocumentVersionSnapshot, LegacyDocumentRecord, LegacyMigrationResult, OwnableVerdictSnapshot } from "./types.js";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string { return typeof value === "string" ? value : fallback; }
function isoOr(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

function versionsFrom(state: Record<string, unknown>, warnings: string[]): DocumentVersionSnapshot[] {
  const raw = Array.isArray(state.versions) ? state.versions : [];
  if (!raw.length) warnings.push("legacy state had no versions; created an empty v1 source snapshot");
  const values = raw.length ? raw : [{ versionNumber: 1, html: "", status: "Draft", timestamp: new Date(0).toISOString() }];
  return values.map((item, index) => {
    const version = record(item) ? item : {};
    const versionNumber = Number.isInteger(version.versionNumber) && (version.versionNumber as number) > 0 ? version.versionNumber as number : index + 1;
    return {
      id: stringOr(version.id, `v${versionNumber}`),
      versionNumber,
      html: stringOr(version.html, ""),
      status: version.status === "Live" ? "Live" : "Draft",
      createdAt: isoOr(version.timestamp ?? version.createdAt),
    };
  });
}

function commentsFrom(state: Record<string, unknown>): Comment[] {
  if (!Array.isArray(state.comments)) return [];
  return state.comments.filter(record).map((comment, index) => {
    const replies = Array.isArray(comment.replies) ? comment.replies.filter(record).map((reply, replyIndex) => ({
      id: stringOr(reply.id, `legacy-reply-${index + 1}-${replyIndex + 1}`),
      author: stringOr(reply.author, "Unknown"),
      body: stringOr(reply.body, ""),
      mentions: Array.isArray(reply.mentions) ? reply.mentions.filter((mention): mention is string => typeof mention === "string") : [],
      ts: typeof reply.ts === "number" && Number.isFinite(reply.ts) ? reply.ts : 0,
    })) : [];
    const target = record(comment.target) ? comment.target : {
      type: "element", id: "", path: "", hash: 0, tag: "", snippet: "",
    };
    return {
      id: stringOr(comment.id, `legacy-comment-${index + 1}`),
      versionId: stringOr(comment.versionId, "v1"),
      author: stringOr(comment.author, "Unknown"),
      body: stringOr(comment.body, ""),
      createdAt: typeof comment.createdAt === "number" && Number.isFinite(comment.createdAt) ? comment.createdAt : 0,
      feedbackType: comment.feedbackType === "approve" || comment.feedbackType === "flag" || comment.feedbackType === "needs" || comment.feedbackType === "question" ? comment.feedbackType : null,
      lifecycle: comment.lifecycle === "resolved" ? "resolved" : "open",
      anchorStatus: comment.anchorStatus === "stale" || comment.anchorStatus === "orphaned" ? comment.anchorStatus : "anchored",
      target: target as unknown as Comment["target"],
      lastKnownContext: stringOr(comment.lastKnownContext, ""),
      resolution: record(comment.resolution) ? comment.resolution as unknown as Comment["resolution"] : null,
      replies,
      mentions: Array.isArray(comment.mentions) ? comment.mentions.filter((mention): mention is string => typeof mention === "string") : [],
      history: Array.isArray(comment.history) ? comment.history.filter(record).map((event) => ({
        event: stringOr(event.event, "legacy"), who: stringOr(event.who, "Unknown"), when: typeof event.when === "number" && Number.isFinite(event.when) ? event.when : 0,
      })) : [],
    };
  });
}

function verdictsFrom(state: Record<string, unknown>, warnings: string[]): OwnableVerdictSnapshot[] {
  const raw = state.verdicts;
  if (!record(raw)) return [];
  const verdicts: OwnableVerdictSnapshot[] = [];
  for (const [accountId, value] of Object.entries(raw)) {
    if (value === null || value === "approve" || value === "changes" || value === "block") {
      verdicts.push({ accountId, verdict: value as Verdict, updatedAt: new Date(0).toISOString() });
    } else {
      warnings.push(`ignored invalid legacy verdict for ${accountId}`);
    }
  }
  return verdicts;
}

export function migrateLegacyDocumentState(recordInput: LegacyDocumentRecord): LegacyMigrationResult {
  const warnings: string[] = [];
  const old = record(recordInput.state) ? recordInput.state : {};
  if (!record(recordInput.state)) warnings.push("legacy state was not an object; used safe defaults");
  const versions = versionsFrom(old, warnings);
  const activeCandidate = old.activeVersionNum;
  const activeVersionNumber = Number.isInteger(activeCandidate) && versions.some((version) => version.versionNumber === activeCandidate)
    ? activeCandidate as number
    : versions[versions.length - 1]!.versionNumber;
  if (activeCandidate !== undefined && activeCandidate !== activeVersionNumber) warnings.push("repaired invalid activeVersionNum");
  const candidateArtifact = old.semanticArtifact;
  const artifactValidation = validateSemanticArtifact(candidateArtifact);
  const artifact = artifactValidation.valid ? candidateArtifact as SemanticArtifact : undefined;
  if (candidateArtifact !== undefined && !artifact) {
    warnings.push("invalid semanticArtifact migrated as legacy; no semantic artifact was invented");
  }
  const candidatePlan = old.visualPlan;
  const visualPlan = artifact
    ? (candidatePlan && validateVisualPlan(candidatePlan as VisualPlan, artifact).valid
      ? candidatePlan as VisualPlan
      : planVisuals(artifact))
    : undefined;
  if (artifact && candidatePlan !== undefined && visualPlan !== candidatePlan) {
    warnings.push("regenerated invalid legacy visualPlan from the valid semantic artifact");
  }
  const state: DocumentStateV2 = {
    schemaVersion: 2,
    documentId: recordInput.documentId,
    workspaceId: recordInput.workspaceId,
    kind: artifact ? "decision_room" : "legacy",
    revision: Number.isInteger(old.revision) && (old.revision as number) >= 0 ? old.revision as number : 0,
    title: recordInput.title?.trim() || stringOr(old.title ?? old.name, "Untitled document"),
    activeVersionNumber,
    versions,
    comments: commentsFrom(old),
    verdicts: verdictsFrom(old, warnings),
    ...(artifact ? { semanticArtifact: artifact, visualPlan } : {}),
    capabilities: [],
  };
  return { state, warnings };
}
