import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentStateV2 } from "htmlcollab-app/persistence";
import {
  assertCutoverReadSafety,
  assertMutationMirrorSafety,
  cutoverStateFromRow,
  legacyMirrorChecksum,
  legacyMirrorProjection,
  legacyUsersProjection,
  legacyWorkspacesProjection,
  PersistenceCutoverError,
  remapLegacyReviewIdentities,
} from "./cutover";

const OWNER = "11111111-1111-4111-8111-111111111111";
const COMMENTER = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-07-20T00:00:00.000Z";

function roomState(): DocumentStateV2 {
  return {
    schemaVersion: 2, documentId: "room-1", workspaceId: "workspace-1", kind: "legacy", revision: 7,
    title: "Rollback-safe room", activeVersionNumber: 1,
    versions: [{ id: "v1", versionNumber: 1, html: "<p>Exact HTML</p>", status: "Draft", createdAt: NOW, createdByAccountId: OWNER }],
    comments: [{
      id: "c1", versionId: "v1", author: COMMENTER, body: "Exact comment", createdAt: 123,
      feedbackType: "question", lifecycle: "resolved", anchorStatus: "anchored",
      target: { type: "text", quote: "Exact HTML", prefix: "", suffix: "" }, lastKnownContext: "Exact HTML",
      resolution: { resolvedBy: OWNER, resolvedAt: 124 }, replies: [{ id: "r1", author: OWNER, body: "Exact reply", mentions: [], ts: 125 }],
      mentions: [], history: [{ event: "resolved", who: OWNER, when: 124 }],
    }],
    verdicts: [{ accountId: COMMENTER, verdict: "changes", updatedAt: NOW }], capabilities: [],
  };
}

test("cutover flag parsing fails closed and table reads require dual-write plus clean parity", () => {
  assert.throws(() => cutoverStateFromRow(undefined), PersistenceCutoverError);
  const blob = cutoverStateFromRow({ read_mode: "blob", dual_write_enabled: false, parity_is_clean: false });
  assert.doesNotThrow(() => assertCutoverReadSafety(blob));
  assert.throws(() => assertMutationMirrorSafety(blob), /dual_write_enabled/);
  assert.throws(
    () => assertCutoverReadSafety(cutoverStateFromRow({ read_mode: "table", dual_write_enabled: false, parity_is_clean: true, last_parity_verified_at: NOW })),
    /dual_write_enabled/,
  );
  assert.throws(
    () => assertCutoverReadSafety(cutoverStateFromRow({ read_mode: "table", dual_write_enabled: true, parity_is_clean: false, last_parity_verified_at: NOW })),
    /clean parity/,
  );
  assert.doesNotThrow(() => assertCutoverReadSafety(cutoverStateFromRow({ read_mode: "table", dual_write_enabled: true, parity_is_clean: true, last_parity_verified_at: NOW })));
});

test("legacy mirror serializer preserves HTML, comments, verdicts, and deterministic checksums", () => {
  const projection = legacyMirrorProjection(
    roomState(), new Map([[OWNER, "Owner"], [COMMENTER, "Commenter"]]),
    [{ accountId: OWNER, role: "owner" }, { accountId: COMMENTER, role: "commenter" }], "legacy-room-1",
  );
  assert.equal(projection.document.id, "legacy-room-1");
  assert.equal((projection.state.versions as Array<{ html: string }>)[0]?.html, "<p>Exact HTML</p>");
  assert.equal((projection.state.comments as Array<{ author: string; body: string; replies: Array<{ author: string }> }>)[0]?.author, "Commenter");
  assert.equal((projection.state.comments as Array<{ replies: Array<{ author: string }> }>)[0]?.replies[0]?.author, "Owner");
  assert.deepEqual(projection.state.verdicts, { Commenter: "changes" });
  assert.deepEqual(projection.state.verdictMetadata, { Commenter: { updatedAt: NOW } });
  const checksum = legacyMirrorChecksum(projection.document, projection.state);
  assert.equal(checksum, legacyMirrorChecksum(projection.document, projection.state));
  assert.notEqual(checksum, legacyMirrorChecksum(projection.document, { ...projection.state, revision: 8 }));
});

test("account and workspace mirrors remain legacy-compatible without tokens or global roles", () => {
  const salt = "a".repeat(32);
  const digest = "b".repeat(128);
  const users = legacyUsersProjection([{ username: "Owner", passwordHash: `scrypt-v1$${salt}$${digest}`, passwordSalt: "" }]);
  assert.deepEqual(users, [{ username: "Owner", passwordSalt: salt, passwordHash: digest }]);
  assert.doesNotMatch(JSON.stringify(users), /token|role/i);

  const workspaces = legacyWorkspacesProjection([{
    id: "normalized-workspace", legacySourceKey: "legacy:workspace:legacy-workspace", name: "Strategy", ownerUsername: "Owner",
    members: [{ username: "Owner", role: "owner" }],
    invitations: [{ id: "invite-1", normalizedUsername: "reviewer", status: "pending", expiresAt: NOW }],
  }]);
  assert.deepEqual(workspaces, [{
    id: "legacy-workspace", normalizedId: "normalized-workspace", name: "Strategy", createdBy: "Owner",
    members: [{ username: "Owner", role: "owner" }],
    invitations: [{ id: "invite-1", username: "reviewer", role: "member", status: "pending", expiresAt: NOW }],
  }]);
  assert.doesNotMatch(JSON.stringify(workspaces), /token/i);
});

test("verified legacy review identities and version locks rehydrate as immutable account IDs", () => {
  const state = roomState();
  const remapped = remapLegacyReviewIdentities(
    {
      ...state,
      versions: [{ ...state.versions[0]!, status: "Draft", createdByAccountId: undefined }],
      comments: state.comments.map((comment) => ({
        ...comment, author: "Commenter",
        resolution: { resolvedBy: "Owner", resolvedAt: 124 },
        replies: comment.replies.map((reply) => ({ ...reply, author: "Owner" })),
        history: comment.history.map((event) => ({ ...event, who: "Owner" })),
      })),
      verdicts: [{ accountId: "Commenter", verdict: "changes", updatedAt: NOW }],
    },
    new Map([["owner", OWNER], ["commenter", COMMENTER]]),
    {
      versions: [{ id: "v1", status: "Published", timestamp: NOW, createdBy: "Owner", publishedBy: "Owner", sourceLockedAt: NOW, sourceLockedBy: "Owner" }],
      comments: [{ id: "c1", posStart: 3, posEnd: 8 }],
      verdictMetadata: { Commenter: { updatedAt: "2026-07-20T01:00:00.000Z" } },
    },
    OWNER,
  );
  assert.equal(remapped.comments[0]?.author, COMMENTER);
  assert.equal(remapped.comments[0]?.resolution?.resolvedBy, OWNER);
  assert.equal(remapped.comments[0]?.replies[0]?.author, OWNER);
  assert.equal(remapped.comments[0]?.history[0]?.who, OWNER);
  assert.equal(remapped.verdicts[0]?.accountId, COMMENTER);
  assert.equal(remapped.verdicts[0]?.updatedAt, "2026-07-20T01:00:00.000Z");
  assert.equal(remapped.comments[0]?.posStart, 3);
  assert.equal(remapped.comments[0]?.posEnd, 8);
  assert.deepEqual(remapped.versions[0], {
    id: "v1", versionNumber: 1, html: "<p>Exact HTML</p>", status: "Live", createdAt: NOW,
    createdByAccountId: OWNER, publishedAt: NOW, publishedByAccountId: OWNER, lockedAt: NOW, lockedByAccountId: OWNER,
  });
  assert.throws(() => remapLegacyReviewIdentities(state, new Map([["owner", OWNER]])), /no immutable account mapping/);
});
