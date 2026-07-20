/** Validation, canonical fingerprints and derived-cache guards for DocumentStateV2. */

import { createHash } from "node:crypto";
import { generateAgentBrief } from "../agent/brief.js";
import { validateAgentBrief } from "../agent/schema.js";
import { validateSemanticArtifact } from "../semantic/schema.js";
import { projectArtifact } from "../visual/project.js";
import { planVisuals } from "../visual/plan.js";
import { validateVisualPlan } from "../visual/validate.js";
import type { SemanticArtifact } from "../semantic/types.js";
import type { VisualPlan } from "../visual/types.js";
import type { DerivedCacheSnapshot, DocumentStateV2, RevisionCheck } from "./types.js";
import type { Capability } from "./types.js";

export interface StateValidationResult { valid: boolean; errors: string[]; }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function strictlyPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function validIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

const VALID_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "room.read", "agent.ask", "comment.create", "comment.reply", "verdict.set_self",
  "comment.resolve", "comment.reopen", "room.edit", "version.create", "version.regenerate",
  "source.lock", "agent.export", "version.publish", "member.manage", "room.archive",
  "ownership.transfer", "workspace.create_document", "workspace.member_manage",
]);

function validCommentSnapshot(comment: unknown): boolean {
  if (!record(comment)) return false;
  if (!["id", "versionId", "author", "body", "lastKnownContext"].every((key) => nonEmptyString(comment[key]) || (key === "body" || key === "lastKnownContext") && typeof comment[key] === "string")) return false;
  if (typeof comment.createdAt !== "number" || !Number.isFinite(comment.createdAt)) return false;
  if (comment.lifecycle !== "open" && comment.lifecycle !== "resolved") return false;
  if (comment.anchorStatus !== "anchored" && comment.anchorStatus !== "stale" && comment.anchorStatus !== "orphaned") return false;
  if (comment.feedbackType !== null && !["approve", "flag", "needs", "question"].includes(comment.feedbackType as string)) return false;
  if (!record(comment.target) || typeof comment.target.type !== "string") return false;
  if (!Array.isArray(comment.replies) || !Array.isArray(comment.mentions) || !Array.isArray(comment.history)) return false;
  return true;
}

function validVerdictSnapshot(verdict: unknown): boolean {
  return record(verdict)
    && nonEmptyString(verdict.accountId)
    && (verdict.verdict === null || verdict.verdict === "approve" || verdict.verdict === "changes" || verdict.verdict === "block")
    && typeof verdict.updatedAt === "string"
    && !Number.isNaN(Date.parse(verdict.updatedAt));
}

/** Stable JSON encodes recursive object keys in sorted order and never mutates input. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!record(value)) throw new Error("Cannot canonicalize unsupported value");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function fingerprintSemanticArtifact(artifact: SemanticArtifact): string {
  const valid = validateSemanticArtifact(artifact);
  if (!valid.valid) throw new Error(`Cannot fingerprint invalid semantic artifact: ${valid.errors.join("; ")}`);
  return createHash("sha256").update(canonicalJson(artifact), "utf8").digest("hex");
}

export function validateDerivedCache(
  cache: unknown,
  artifact: SemanticArtifact,
): cache is DerivedCacheSnapshot {
  if (!record(cache)) return false;
  if (cache.semanticArtifactFingerprint !== fingerprintSemanticArtifact(artifact)) return false;
  if (cache.semanticSchemaVersion !== 1 || cache.projectionSchemaVersion !== 1) return false;
  if (cache.agentBrief !== undefined && !validateAgentBrief(cache.agentBrief, artifact).valid) return false;
  if (cache.tipTapDoc !== undefined && (!record(cache.tipTapDoc) || cache.tipTapDoc.type !== "doc" || !Array.isArray(cache.tipTapDoc.content))) return false;
  return true;
}

/** Returns regenerated, deterministic derived material without modifying a source artifact. */
export function rebuildDerivedCache(artifact: SemanticArtifact): DerivedCacheSnapshot {
  return {
    semanticArtifactFingerprint: fingerprintSemanticArtifact(artifact),
    semanticSchemaVersion: 1,
    projectionSchemaVersion: 1,
    tipTapDoc: projectArtifact(artifact, planVisuals(artifact)),
    agentBrief: generateAgentBrief(artifact),
  };
}

/** A stale or malformed cache is ignored; callers can replace it in their next transaction. */
export function usableDerivedCache(
  cache: unknown,
  artifact: SemanticArtifact,
): DerivedCacheSnapshot {
  return validateDerivedCache(cache, artifact) ? cache : rebuildDerivedCache(artifact);
}

export function currentVisualPlan(
  storedPlan: unknown,
  artifact: SemanticArtifact,
): VisualPlan {
  if (storedPlan && validateVisualPlan(storedPlan as VisualPlan, artifact).valid) return storedPlan as VisualPlan;
  return planVisuals(artifact);
}

export function checkExpectedRevision(currentRevision: number, expectedRevision: unknown): RevisionCheck {
  if (Number.isInteger(expectedRevision) && expectedRevision === currentRevision) return { ok: true };
  return { ok: false, conflict: { status: 409, code: "revision_conflict", currentRevision } };
}

export function validateDocumentStateV2(state: unknown): StateValidationResult {
  const errors: string[] = [];
  if (!record(state)) return { valid: false, errors: ["document state is not an object"] };
  if (state.schemaVersion !== 2) errors.push("schemaVersion must be 2");
  for (const key of ["documentId", "workspaceId", "title"] as const) {
    if (!nonEmptyString(state[key])) errors.push(`${key} must be a non-empty string`);
  }
  if (state.kind !== "legacy" && state.kind !== "decision_room") errors.push("kind must be legacy or decision_room");
  if (!positiveInteger(state.revision)) errors.push("revision must be a non-negative integer");
  if (!strictlyPositiveInteger(state.activeVersionNumber)) errors.push("activeVersionNumber must be a positive integer");
  for (const key of ["versions", "comments", "verdicts", "capabilities"] as const) {
    if (!Array.isArray(state[key])) errors.push(`${key} must be an array`);
  }
  if (Array.isArray(state.comments) && state.comments.some((comment) => !validCommentSnapshot(comment))) {
    errors.push("comments contains an invalid snapshot");
  }
  if (Array.isArray(state.verdicts) && state.verdicts.some((verdict) => !validVerdictSnapshot(verdict))) {
    errors.push("verdicts contains an invalid snapshot");
  }
  if (Array.isArray(state.capabilities) && state.capabilities.some((capability) => typeof capability !== "string" || !VALID_CAPABILITIES.has(capability as Capability))) {
    errors.push("capabilities contains an invalid capability");
  }
  if (Array.isArray(state.versions)) {
    const numbers = new Set<number>();
    const ids = new Set<string>();
    for (const version of state.versions) {
      if (!record(version)
        || !strictlyPositiveInteger(version.versionNumber)
        || !nonEmptyString(version.id)
        || typeof version.html !== "string"
        || (version.status !== "Draft" && version.status !== "Live")
        || !validIsoDate(version.createdAt)) {
        errors.push("versions contains an invalid snapshot");
        continue;
      }
      if (numbers.has(version.versionNumber as number)) errors.push("versions contains duplicate versionNumber");
      if (ids.has(version.id as string)) errors.push("versions contains duplicate id");
      numbers.add(version.versionNumber as number);
      ids.add(version.id as string);
      for (const field of ["createdByAccountId", "publishedByAccountId", "lockedByAccountId"] as const) {
        if (version[field] !== undefined && !nonEmptyString(version[field])) errors.push(`versions contains invalid ${field}`);
      }
      for (const field of ["publishedAt", "lockedAt"] as const) {
        if (version[field] !== undefined && !validIsoDate(version[field])) errors.push(`versions contains invalid ${field}`);
      }
      if ((version.publishedAt === undefined) !== (version.publishedByAccountId === undefined)) {
        errors.push("versions contains incomplete publish metadata");
      }
      if ((version.lockedAt === undefined) !== (version.lockedByAccountId === undefined)) {
        errors.push("versions contains incomplete lock metadata");
      }
    }
    if (strictlyPositiveInteger(state.activeVersionNumber) && !numbers.has(state.activeVersionNumber as number)) {
      errors.push("activeVersionNumber does not reference a version");
    }
  }
  const artifact = state.semanticArtifact;
  const plan = state.visualPlan;
  if (state.kind === "legacy") {
    if (artifact !== undefined || plan !== undefined) errors.push("legacy state must not contain semantic artifact or visual plan");
    if (Array.isArray(state.versions) && state.versions.some((version) => record(version) && version.derivedCache !== undefined)) {
      errors.push("legacy state must not contain semantic derived caches");
    }
  } else {
    const artifactValidation = validateSemanticArtifact(artifact);
    if (!artifactValidation.valid) errors.push(...artifactValidation.errors.map((error) => `semanticArtifact: ${error}`));
    else {
      const artifactTyped = artifact as SemanticArtifact;
      if (!plan || !validateVisualPlan(plan as VisualPlan, artifactTyped).valid) errors.push("decision_room requires a valid visualPlan");
      if (Array.isArray(state.versions)) {
        for (const version of state.versions) {
          if (record(version) && version.derivedCache !== undefined && !validateDerivedCache(version.derivedCache, artifactTyped)) {
            errors.push("versions contains an invalid derived cache");
          }
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
