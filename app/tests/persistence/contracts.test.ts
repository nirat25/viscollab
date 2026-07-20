import { describe, expect, it } from "vitest";
import {
  authorize,
  capabilitiesForRole,
  canonicalJson,
  checkExpectedRevision,
  currentVisualPlan,
  fingerprintSemanticArtifact,
  migrateLegacyDocumentState,
  normalizeUsername,
  sessionIdentity,
  rebuildDerivedCache,
  usableDerivedCache,
  validateAccount,
  validateDerivedCache,
  validateDocumentStateV2,
} from "../../src/persistence/index.js";
import type { DocumentStateV2, RoomRole } from "../../src/persistence/index.js";
import type { SemanticArtifact } from "../../src/semantic/types.js";
import { planVisuals } from "../../src/visual/plan.js";

const artifact: SemanticArtifact = {
  schemaVersion: 1,
  id: "sa_1",
  sourceFile: "memo.md",
  title: "Memo",
  bluf: "Choose A.",
  thesis: "A is supported.",
  primaryDecisionId: "decision_1",
  extractedBy: "mock",
  nodes: [
    {
      id: "decision_1", kind: "decision", title: "Choose A", summary: "Choose A.",
      question: "Should we choose A?", sourceStatus: "explicit",
      sourceRefs: [{ quote: "Should we choose A?" }],
    },
  ],
};

const allRoomCapabilities = [
  "room.read", "agent.ask", "comment.create", "comment.reply", "verdict.set_self",
  "comment.resolve", "comment.reopen", "room.edit", "version.create", "version.regenerate",
  "source.lock", "agent.export", "version.publish", "member.manage", "room.archive",
  "ownership.transfer",
] as const;

describe("PERS-001/002 identity and capability contracts", () => {
  const expected: Readonly<Record<RoomRole, readonly string[]>> = {
    viewer: ["room.read", "agent.ask"],
    commenter: ["room.read", "agent.ask", "comment.create", "comment.reply", "verdict.set_self", "comment.resolve", "comment.reopen"],
    collaborator: ["room.read", "agent.ask", "comment.create", "comment.reply", "verdict.set_self", "comment.resolve", "comment.reopen", "room.edit", "version.create", "version.regenerate", "source.lock", "agent.export"],
    owner: ["room.read", "agent.ask", "comment.create", "comment.reply", "verdict.set_self", "comment.resolve", "comment.reopen", "room.edit", "version.create", "version.regenerate", "source.lock", "agent.export", "version.publish", "member.manage", "room.archive", "ownership.transfer"],
  };

  for (const role of Object.keys(expected) as RoomRole[]) {
    it(`${role} has exactly the documented capabilities`, () => {
      expect(capabilitiesForRole(role)).toEqual(expected[role]);
      for (const capability of allRoomCapabilities) {
        const allowed = expected[role].includes(capability);
        const result = authorize({ accountId: "a1" }, { documentId: "d1", roomRole: role }, capability, { threadAuthorAccountId: "a1" });
        expect(result).toBe(allowed);
      }
    });
  }

  it("lets commenters resolve only their own thread, while higher roles can resolve any", () => {
    const subject = { accountId: "a1" };
    expect(authorize(subject, { roomRole: "commenter" }, "comment.resolve", { threadAuthorAccountId: "a1" })).toBe(true);
    expect(authorize(subject, { roomRole: "commenter" }, "comment.resolve", { threadAuthorAccountId: "a2" })).toBe(false);
    expect(authorize(subject, { roomRole: "collaborator" }, "comment.reopen", { threadAuthorAccountId: "a2" })).toBe(true);
  });

  it("fails closed for unknown roles, missing identity, and workspace membership that is not owner", () => {
    expect(capabilitiesForRole("admin")).toEqual([]);
    expect(authorize({ accountId: "a1" }, { roomRole: "admin" }, "room.read")).toBe(false);
    expect(authorize({ accountId: "" }, { roomRole: "owner" }, "room.read")).toBe(false);
    expect(authorize({ accountId: "a1" }, { workspaceRole: "member" }, "workspace.create_document", { workspaceOwnerAccountId: "a1" })).toBe(false);
    expect(authorize({ accountId: "a1" }, { workspaceRole: "owner" }, "workspace.create_document", { workspaceOwnerAccountId: "a1" })).toBe(true);
  });

  it("normalizes usernames independently from immutable account IDs and exposes only safe session fields", () => {
    expect(normalizeUsername("  Nirat ")).toBe("nirat");
    expect(normalizeUsername("Ｎｉｒａｔ")).toBe("nirat");
    expect(normalizeUsername(" ")).toBeNull();
    expect(sessionIdentity({ id: "account-uuid", username: "Nirat" })).toEqual({ accountId: "account-uuid", username: "Nirat" });
    expect(validateAccount({
      id: "11111111-1111-4111-8111-111111111111", username: "Nirat", normalizedUsername: "nirat",
      passwordHash: "hash", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    })).toBe(true);
    expect(validateAccount({
      id: "mutable-name", username: "Nirat", normalizedUsername: "nirat",
      passwordHash: "hash", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    })).toBe(false);
  });
});

describe("PERS-003 durable document state and deterministic caches", () => {
  const plan = planVisuals(artifact);
  const base = (): DocumentStateV2 => ({
    schemaVersion: 2, documentId: "d1", workspaceId: "w1", kind: "decision_room", revision: 4,
    title: "Memo", activeVersionNumber: 1,
    versions: [{ id: "v1", versionNumber: 1, html: "<p>Source</p>", status: "Draft", createdAt: "2026-01-01T00:00:00.000Z" }],
    comments: [], verdicts: [], semanticArtifact: artifact, visualPlan: plan,
    capabilities: ["room.read"],
  });

  it("validates complete decision-room state and enforces legacy/semantic separation", () => {
    expect(validateDocumentStateV2(base())).toEqual({ valid: true, errors: [] });
    const legacy = { ...base(), kind: "legacy" as const };
    expect(validateDocumentStateV2(legacy).errors.join(" ")).toMatch(/legacy state/);
    const noPlan = { ...base(), visualPlan: undefined };
    expect(validateDocumentStateV2(noPlan).errors.join(" ")).toMatch(/requires a valid visualPlan/);
  });

  it("validates durable version metadata while allowing an empty legacy source snapshot", () => {
    const sparseLegacy: DocumentStateV2 = {
      schemaVersion: 2, documentId: "legacy-1", workspaceId: "w1", kind: "legacy", revision: 0,
      title: "Sparse", activeVersionNumber: 1,
      versions: [{ id: "v1", versionNumber: 1, html: "", status: "Draft", createdAt: "1970-01-01T00:00:00.000Z" }],
      comments: [], verdicts: [], capabilities: [],
    };
    expect(validateDocumentStateV2(sparseLegacy)).toEqual({ valid: true, errors: [] });
    const invalidStatus = { ...sparseLegacy, versions: [{ ...sparseLegacy.versions[0], status: "published" }] };
    expect(validateDocumentStateV2(invalidStatus).errors).toContain("versions contains an invalid snapshot");
    const incompletePublish = { ...sparseLegacy, versions: [{ ...sparseLegacy.versions[0], publishedAt: "2026-01-01T00:00:00.000Z" }] };
    expect(validateDocumentStateV2(incompletePublish).errors).toContain("versions contains incomplete publish metadata");
  });

  it("keeps fingerprinting canonical and mutation-free", () => {
    const before = JSON.stringify(artifact);
    expect(canonicalJson({ z: [2, { b: 1, a: 2 }], a: true })).toBe('{"a":true,"z":[2,{"a":2,"b":1}]}');
    const one = fingerprintSemanticArtifact(artifact);
    const two = fingerprintSemanticArtifact(JSON.parse(JSON.stringify(artifact)) as SemanticArtifact);
    expect(one).toMatch(/^[a-f0-9]{64}$/);
    expect(one).toBe(two);
    expect(JSON.stringify(artifact)).toBe(before);
  });

  it("invalidates stale caches but always rebuilds a usable deterministic projection", () => {
    const cache = rebuildDerivedCache(artifact);
    expect(validateDerivedCache(cache, artifact)).toBe(true);
    const stale = { ...cache, semanticArtifactFingerprint: "0".repeat(64) };
    expect(validateDerivedCache(stale, artifact)).toBe(false);
    expect(usableDerivedCache(stale, artifact).semanticArtifactFingerprint).toBe(fingerprintSemanticArtifact(artifact));
    expect(currentVisualPlan({ schemaVersion: 1, artifactId: "wrong", blocks: [] }, artifact)).toEqual(plan);
  });

  it("returns only a stable revision conflict, never merges a stale command", () => {
    expect(checkExpectedRevision(5, 5)).toEqual({ ok: true });
    expect(checkExpectedRevision(5, 4)).toEqual({ ok: false, conflict: { status: 409, code: "revision_conflict", currentRevision: 5 } });
    expect(checkExpectedRevision(5, undefined)).toEqual({ ok: false, conflict: { status: 409, code: "revision_conflict", currentRevision: 5 } });
  });
});

describe("PERS-003 legacy migration transform", () => {
  it("preserves source/comments/verdicts and keeps a schema-valid semantic room a decision room", () => {
    const source = {
      versions: [{ versionNumber: 1, html: "<h1>Untouched</h1>", status: "Live", timestamp: "2025-01-01T00:00:00.000Z" }],
      activeVersionNum: 1,
      comments: [{ id: "c1", author: "old", body: "Keep", versionId: "v1", replies: [] }],
      verdicts: { account_1: "approve", account_2: null },
      semanticArtifact: artifact,
      visualPlan: planVisuals(artifact),
    };
    const migrated = migrateLegacyDocumentState({ documentId: "d-old", workspaceId: "w1", title: "Old", state: source });
    expect(migrated.state.kind).toBe("decision_room");
    expect(migrated.state.semanticArtifact).toEqual(artifact);
    expect(migrated.state.visualPlan).toEqual(planVisuals(artifact));
    expect(migrated.state.versions[0]?.html).toBe("<h1>Untouched</h1>");
    expect(migrated.state.comments[0]?.body).toBe("Keep");
    expect(migrated.state.verdicts).toHaveLength(2);
    expect(source.versions[0]?.html).toBe("<h1>Untouched</h1>");
  });

  it("treats an absent or invalid semantic artifact as legacy and never invents one", () => {
    const migrated = migrateLegacyDocumentState({
      documentId: "d-old", workspaceId: "w1", state: {
        versions: [{ versionNumber: 1, html: "<p>Raw</p>", status: "Draft" }],
        semanticArtifact: { schemaVersion: 1, id: "not-valid" },
        visualPlan: planVisuals(artifact),
      },
    });
    expect(migrated.state.kind).toBe("legacy");
    expect(migrated.state.semanticArtifact).toBeUndefined();
    expect(migrated.state.visualPlan).toBeUndefined();
    expect(migrated.state.versions[0]?.html).toBe("<p>Raw</p>");
    expect(migrated.warnings.join(" ")).toMatch(/invalid semanticArtifact/);
  });

  it("uses deterministic safe defaults for sparse legacy blobs without semantic invention", () => {
    const first = migrateLegacyDocumentState({ documentId: "d1", workspaceId: "w1", state: {} });
    const second = migrateLegacyDocumentState({ documentId: "d1", workspaceId: "w1", state: {} });
    expect(first).toEqual(second);
    expect(first.state.versions[0]).toMatchObject({ id: "v1", html: "", createdAt: "1970-01-01T00:00:00.000Z" });
    expect(first.state.kind).toBe("legacy");
  });
});
