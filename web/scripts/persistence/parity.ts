import type { Client } from "pg";
import { validateSemanticArtifact } from "htmlcollab-app/semantic";
import type { SemanticArtifact } from "htmlcollab-app/semantic";
import { planVisuals, validateVisualPlan } from "htmlcollab-app/visual";
import type { VisualPlan } from "htmlcollab-app/visual";
import { connect, parseArgs, printUsage, queryRows, sha256, stableJson, tableExists, uuidFromSource, withAdvisoryLock, writeManifest } from "./shared";

type ObjectValue = Record<string, unknown>;
type LegacyRow = { key: string; value: unknown };
type Check = { name: string; pass: boolean; detail?: unknown };

const object = (value: unknown): ObjectValue | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : null;
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string => typeof value === "string" ? value : "";
const username = (value: unknown): string => text(value).normalize("NFKC").trim().toLowerCase();
const iso = (value: unknown): string | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
};
const verdict = (value: unknown): string | null => value === "changes" || value === "request changes" ? "request_changes" : value === "approve" || value === "request_changes" || value === "block" ? value : null;
const same = (actual: unknown, expected: unknown): boolean => stableJson(actual) === stableJson(expected);

function canonicalPassword(passwordHash: unknown, passwordSalt: unknown): string {
  const hash = text(passwordHash);
  if (hash.startsWith("scrypt-v1$")) return hash;
  return `scrypt-v1$${text(passwordSalt)}$${hash}`;
}

function commentTargetPayload(comment: ObjectValue): ObjectValue {
  return {
    target: object(comment.target) ?? {},
    feedbackType: ["approve", "flag", "needs", "question"].includes(text(comment.feedbackType)) ? comment.feedbackType : null,
    ...(typeof comment.posStart === "number" && Number.isFinite(comment.posStart) ? { posStart: comment.posStart } : {}),
    ...(typeof comment.posEnd === "number" && Number.isFinite(comment.posEnd) ? { posEnd: comment.posEnd } : {}),
    lastKnownContext: text(comment.lastKnownContext),
    mentions: array(comment.mentions).filter((mention): mention is string => typeof mention === "string"),
    resolution: object(comment.resolution)
      ? { ...object(comment.resolution)!, resolvedBy: uuidFromSource(`account:${username(object(comment.resolution)?.resolvedBy)}`) }
      : null,
  };
}

async function legacyRows(client: Client): Promise<Map<string, unknown>> {
  if (!await tableExists(client, "collab_state")) throw new Error("Legacy collab_state table is missing; there is no blob source for a parity read.");
  const rows = await queryRows<LegacyRow>(client, "SELECT key, value FROM collab_state ORDER BY key");
  return new Map(rows.map((row) => [row.key, row.value]));
}

function push(checks: Check[], name: string, actual: unknown, expected: unknown): void {
  const pass = same(actual, expected);
  checks.push({ name, pass, detail: pass ? undefined : { expected, actual } });
}

async function verifyCatalogs(client: Client, legacy: ReadonlyMap<string, unknown>, checks: Check[]): Promise<void> {
  const expectedAccounts = array(legacy.get("users")).map(object).filter((entry): entry is ObjectValue => Boolean(entry)).map((entry) => ({
    username: username(entry.username),
    password: canonicalPassword(entry.passwordHash, entry.passwordSalt),
  })).sort((a, b) => a.username.localeCompare(b.username));
  const actualAccounts = await queryRows<{ username_normalized: string; password_hash: string; password_salt: string }>(client,
    "SELECT username_normalized,password_hash,password_salt FROM accounts ORDER BY username_normalized");
  push(checks, "accounts", actualAccounts.map((entry) => ({
    username: entry.username_normalized,
    password: canonicalPassword(entry.password_hash, entry.password_salt),
  })), expectedAccounts);

  const expectedWorkspaces = array(legacy.get("workspaces")).map(object).filter((entry): entry is ObjectValue => Boolean(entry)).map((entry) => {
    const legacyId = text(entry.id);
    return {
      id: text(entry.normalizedId) || uuidFromSource(`workspace:${legacyId}`),
      legacySourceKey: `legacy:workspace:${legacyId}`,
      name: text(entry.name) || "Untitled workspace",
      owner: username(entry.createdBy ?? entry.owner),
      members: array(entry.members).map(object).filter((member): member is ObjectValue => Boolean(member)).map((member) => ({
        username: username(member.username), role: text(member.role) === "owner" ? "owner" : "member",
      })).sort((a, b) => a.username.localeCompare(b.username)),
      invitations: array(entry.invitations).map(object).filter((invitation): invitation is ObjectValue => Boolean(invitation)).map((invitation) => ({
        id: text(invitation.id), username: username(invitation.username ?? invitation.normalizedUsername),
        status: text(invitation.status) || "pending", expiresAt: iso(invitation.expiresAt),
      })).sort((a, b) => a.id.localeCompare(b.id)),
    };
  }).sort((a, b) => a.legacySourceKey.localeCompare(b.legacySourceKey));
  const workspaceRows = await queryRows<{ id: string; legacy_source_key: string; name: string; owner: string }>(client, `
    SELECT w.id::text,w.legacy_source_key,w.name,a.username_normalized AS owner
    FROM workspaces w JOIN accounts a ON a.id=w.owner_account_id
    ORDER BY w.legacy_source_key,w.id`);
  const actualWorkspaces = [] as typeof expectedWorkspaces;
  for (const workspace of workspaceRows) {
    const members = await queryRows<{ username: string; role: string }>(client, `
      SELECT a.username_normalized AS username,wm.role::text AS role
      FROM workspace_members wm JOIN accounts a ON a.id=wm.account_id
      WHERE wm.workspace_id=$1 ORDER BY a.username_normalized`, [workspace.id]);
    const invitations = await queryRows<{ id: string; username: string; status: string; expires_at: unknown }>(client, `
      SELECT wi.id::text,wi.invitee_username_normalized AS username,wi.status::text,wi.expires_at
      FROM workspace_invitations wi
      WHERE wi.workspace_id=$1 ORDER BY wi.id`, [workspace.id]);
    actualWorkspaces.push({
      id: workspace.id, legacySourceKey: workspace.legacy_source_key, name: workspace.name, owner: workspace.owner,
      members: members.map((member) => ({ username: member.username, role: member.role === "owner" ? "owner" : "member" })),
      invitations: invitations.map((invitation) => ({ id: invitation.id, username: invitation.username,
        status: invitation.status, expiresAt: iso(invitation.expires_at) })),
    });
  }
  push(checks, "workspaces", actualWorkspaces, expectedWorkspaces);

  const documentCount = await queryRows<{ count: string }>(client, "SELECT count(*)::text AS count FROM documents");
  push(checks, "document_count", Number(documentCount[0]?.count ?? -1), array(legacy.get("documents")).length);
}

async function verifyDocument(client: Client, sourceKey: string, document: ObjectValue, state: ObjectValue, checksum: string, checks: Check[]): Promise<void> {
  const source = (await queryRows<{ source_checksum: string; document_id: string }>(client, "SELECT source_checksum, document_id FROM migration_sources WHERE source_key = $1", [sourceKey]))[0];
  push(checks, `${sourceKey}:source_checksum`, source?.source_checksum, checksum);
  if (!source) return;
  push(checks, `${sourceKey}:document_id`, source.document_id, text(document.normalizedId) || uuidFromSource(sourceKey));
  const normalizedDocument = (await queryRows<{ title: string; active_version_number: number; kind: string }>(client, "SELECT title, active_version_number, kind FROM documents WHERE id = $1", [source.document_id]))[0];
  push(checks, `${sourceKey}:title`, normalizedDocument?.title, text(document.name) || "Untitled document");
  push(checks, `${sourceKey}:active_version`, normalizedDocument?.active_version_number, Number(state.activeVersionNum) || Number(object(array(state.versions).at(-1))?.versionNumber) || 1);

  const artifact = state.semanticArtifact;
  const artifactCheck = validateSemanticArtifact(artifact);
  const expectedKind = artifactCheck.valid ? "decision_room" : "legacy";
  push(checks, `${sourceKey}:kind`, normalizedDocument?.kind, expectedKind);

  const actualMembers = await queryRows<{ username: string; role: string }>(client, `SELECT a.username_normalized AS username, rm.role::text AS role FROM room_members rm JOIN accounts a ON a.id = rm.account_id WHERE rm.document_id = $1 ORDER BY a.username_normalized`, [source.document_id]);
  const expectedMembers = array(document.members).map(object).filter((member): member is ObjectValue => Boolean(member)).map((member) => ({ username: username(member.username), role: text(member.role) })).sort((a, b) => a.username.localeCompare(b.username));
  push(checks, `${sourceKey}:memberships`, actualMembers, expectedMembers);

  const actualVersions = await queryRows<{ id: string; legacy_version_id: string; version_number: number; source_html: string; created_by: string; created_at: unknown; published_at: unknown; published_by: string | null; source_locked_at: unknown; source_locked_by: string | null }>(client, `
    SELECT v.id, v.legacy_version_id, v.version_number, v.source_html,
      creator.username_normalized AS created_by, v.created_at,
      v.published_at, publisher.username_normalized AS published_by,
      v.source_locked_at, locker.username_normalized AS source_locked_by
    FROM document_versions v
    JOIN accounts creator ON creator.id = v.created_by_account_id
    LEFT JOIN accounts publisher ON publisher.id = v.published_by_account_id
    LEFT JOIN accounts locker ON locker.id = v.source_locked_by_account_id
    WHERE v.document_id = $1 ORDER BY v.version_number`, [source.document_id]);
  const owner = expectedMembers.find((member) => member.role === "owner")?.username;
  const expectedVersions = array(state.versions).map((raw, index) => {
    const version = object(raw)!;
    const number = Number(version.versionNumber) || index + 1;
    const legacyId = text(version.id) || `v${number}`;
    const createdBy = username(version.createdBy) || owner;
    const published = ["published", "live"].includes(text(version.status).toLowerCase());
    const lockedAt = iso(version.sourceLockedAt) ?? iso(version.lockedAt);
    return {
      id: uuidFromSource(`${sourceKey}:version:${legacyId}`), legacy_version_id: legacyId,
      version_number: number, source_html: text(version.html), created_by: createdBy,
      created_at: iso(version.timestamp), published_at: published ? iso(version.publishedAt) ?? iso(version.timestamp) : undefined,
      published_by: published ? username(version.publishedBy) || createdBy : undefined,
      source_locked_at: lockedAt, source_locked_by: lockedAt ? username(version.sourceLockedBy) || username(version.lockedBy) || createdBy : undefined,
    };
  });
  push(checks, `${sourceKey}:version_count`, actualVersions.length, expectedVersions.length);
  for (const [index, expected] of expectedVersions.entries()) {
    const actual = actualVersions[index];
    for (const field of ["id", "legacy_version_id", "version_number", "source_html", "created_by"] as const) push(checks, `${sourceKey}:version:${expected.legacy_version_id}:${field}`, actual?.[field], expected[field]);
    for (const field of ["created_at", "published_at", "source_locked_at"] as const) if (expected[field]) push(checks, `${sourceKey}:version:${expected.legacy_version_id}:${field}`, iso(actual?.[field]), expected[field]);
    for (const field of ["published_by", "source_locked_by"] as const) push(checks, `${sourceKey}:version:${expected.legacy_version_id}:${field}`, actual?.[field] ?? undefined, expected[field]);
  }

  const actualComments = await queryRows<{ id: string; legacy_thread_id: string; legacy_version_id: string; author: string; target_payload: unknown; body: string; lifecycle: string; anchor_state: string; resolved_at: unknown; resolved_by: string | null; created_at: unknown }>(client, `
    SELECT t.id, t.legacy_thread_id, v.legacy_version_id, a.username_normalized AS author,
      t.target_payload, t.body, t.lifecycle::text, t.anchor_state::text, t.resolved_at,
      resolver.username_normalized AS resolved_by, t.created_at
    FROM comment_threads t JOIN accounts a ON a.id=t.author_account_id
    LEFT JOIN accounts resolver ON resolver.id=t.resolved_by_account_id
    LEFT JOIN document_versions v ON v.id=t.version_id
    WHERE t.document_id=$1 ORDER BY t.legacy_thread_id`, [source.document_id]);
  const expectedComments = array(state.comments).map((raw) => {
    const value = object(raw)!;
    return { value, legacyId: text(value.id) || sha256(raw).slice(0, 24) };
  }).sort((a, b) => a.legacyId.localeCompare(b.legacyId));
  push(checks, `${sourceKey}:comment_count`, actualComments.length, expectedComments.length);
  for (const [index, entry] of expectedComments.entries()) {
    const { value: expected, legacyId } = entry;
    const actual = actualComments[index];
    const resolution = object(expected.resolution);
    const lifecycle = expected.lifecycle === "resolved" ? "resolved" : "open";
    const expectedAnchor = expected.anchorStatus === "stale" || expected.anchorStatus === "orphaned" ? expected.anchorStatus : "anchored";
    push(checks, `${sourceKey}:comment:${legacyId}:id`, actual?.id, uuidFromSource(`${sourceKey}:comment:${legacyId}`));
    push(checks, `${sourceKey}:comment:${legacyId}:version`, actual?.legacy_version_id, text(expected.versionId));
    push(checks, `${sourceKey}:comment:${legacyId}:author`, actual?.author, username(expected.author));
    push(checks, `${sourceKey}:comment:${legacyId}:target_payload`, actual?.target_payload, commentTargetPayload(expected));
    push(checks, `${sourceKey}:comment:${legacyId}:body`, actual?.body, text(expected.body) || "(legacy comment)");
    push(checks, `${sourceKey}:comment:${legacyId}:status`, { lifecycle: actual?.lifecycle, anchor: actual?.anchor_state }, { lifecycle, anchor: expectedAnchor });
    push(checks, `${sourceKey}:comment:${legacyId}:resolution_actor`, actual?.resolved_by ?? undefined, lifecycle === "resolved" ? username(resolution?.resolvedBy) : undefined);
    if (lifecycle === "resolved") push(checks, `${sourceKey}:comment:${legacyId}:resolution_at`, iso(actual?.resolved_at), iso(resolution?.resolvedAt) ?? iso(expected.createdAt));
    if (iso(expected.createdAt)) push(checks, `${sourceKey}:comment:${legacyId}:created_at`, iso(actual?.created_at), iso(expected.createdAt));

    const replies = await queryRows<{ id: string; legacy_reply_id: string; author: string; body: string; created_at: unknown }>(client, `SELECT r.id,r.legacy_reply_id,a.username_normalized AS author,r.body,r.created_at FROM comment_replies r JOIN accounts a ON a.id=r.author_account_id WHERE r.thread_id=$1 ORDER BY r.legacy_sequence`, [actual?.id]);
    const expectedReplies = array(expected.replies).map((rawReply) => object(rawReply)!);
    push(checks, `${sourceKey}:comment:${legacyId}:reply_count`, replies.length, expectedReplies.length);
    for (const [replyIndex, expectedReply] of expectedReplies.entries()) {
      const replyId = text(expectedReply.id) || sha256(expectedReply).slice(0, 24);
      const reply = replies[replyIndex];
      push(checks, `${sourceKey}:reply:${replyId}:identity`, { id: reply?.id, legacyId: reply?.legacy_reply_id }, { id: uuidFromSource(`${sourceKey}:reply:${legacyId}:${replyId}`), legacyId: replyId });
      push(checks, `${sourceKey}:reply:${replyId}:content`, { author: reply?.author, body: reply?.body }, { author: username(expectedReply.author), body: text(expectedReply.body) || "(legacy reply)" });
      const replyTimestamp = iso(expectedReply.ts) ?? iso(expectedReply.createdAt);
      if (replyTimestamp) push(checks, `${sourceKey}:reply:${replyId}:created_at`, iso(reply?.created_at), replyTimestamp);
    }
    const history = await queryRows<{ actor: string | null; event_type: string; event_payload: unknown; created_at: unknown }>(client, `SELECT a.username_normalized AS actor,h.event_type,h.event_payload,h.created_at FROM comment_history h LEFT JOIN accounts a ON a.id=h.actor_account_id WHERE h.thread_id=$1 ORDER BY h.legacy_sequence`, [actual?.id]);
    const expectedHistory = array(expected.history).map((rawHistory) => object(rawHistory)!);
    push(checks, `${sourceKey}:comment:${legacyId}:history_count`, history.length, expectedHistory.length);
    for (const [historyIndex, expectedEvent] of expectedHistory.entries()) {
      const actualEvent = history[historyIndex];
      push(checks, `${sourceKey}:history:${legacyId}:${historyIndex}`, { actor: actualEvent?.actor ?? undefined, event: actualEvent?.event_type, payload: actualEvent?.event_payload, at: iso(actualEvent?.created_at) }, { actor: username(expectedEvent.who) || undefined, event: text(expectedEvent.event) || "legacy_history", payload: { legacy: expectedEvent }, at: iso(expectedEvent.when) });
    }
  }

  const actualVerdicts = await queryRows<{ username: string; verdict: string }>(client, `SELECT a.username_normalized AS username,v.verdict::text FROM verdicts v JOIN accounts a ON a.id=v.account_id WHERE v.document_id=$1 ORDER BY a.username_normalized`, [source.document_id]);
  const expectedVerdicts = Object.entries(object(state.verdicts) ?? {}).map(([name, value]) => ({ username: username(name), verdict: verdict(value) })).filter((item): item is { username: string; verdict: string } => Boolean(item.verdict)).sort((a, b) => a.username.localeCompare(b.username));
  push(checks, `${sourceKey}:verdicts`, actualVerdicts, expectedVerdicts);

  const semantic = (await queryRows<{ artifact: unknown; artifact_fingerprint: string }>(client, "SELECT artifact,artifact_fingerprint FROM semantic_artifacts WHERE document_id=$1", [source.document_id]))[0];
  const visual = (await queryRows<{ plan: unknown; artifact_fingerprint: string }>(client, "SELECT plan,artifact_fingerprint FROM visual_plans WHERE document_id=$1", [source.document_id]))[0];
  if (expectedKind === "legacy") {
    push(checks, `${sourceKey}:semantic_absent`, Boolean(semantic), false);
    push(checks, `${sourceKey}:visual_absent`, Boolean(visual), false);
  } else {
    const fingerprint = sha256(artifact);
    const suppliedPlan = state.visualPlan;
    const plan = suppliedPlan && validateVisualPlan(suppliedPlan as VisualPlan, artifact as SemanticArtifact).valid ? suppliedPlan : planVisuals(artifact as SemanticArtifact);
    push(checks, `${sourceKey}:semantic`, { artifact: semantic?.artifact, fingerprint: semantic?.artifact_fingerprint }, { artifact, fingerprint });
    push(checks, `${sourceKey}:visual`, { plan: visual?.plan, fingerprint: visual?.artifact_fingerprint }, { plan, fingerprint });
  }
}

async function verify(client: Client): Promise<{ sourceChecksum: string; checks: Check[] }> {
  if (!await tableExists(client, "migration_sources")) throw new Error("migration_sources is missing; run db:migrate before parity verification.");
  const legacy = await legacyRows(client);
  const checks: Check[] = [];
  await verifyCatalogs(client, legacy, checks);
  for (const rawDocument of array(legacy.get("documents"))) {
    const document = object(rawDocument);
    const id = text(document?.id);
    const state = id ? object(legacy.get(`doc_${id}`)) : null;
    const sourceKey = `legacy:document:${id || "missing"}`;
    if (!document || !state) {
      checks.push({ name: `${sourceKey}:valid_source`, pass: false });
      continue;
    }
    await verifyDocument(client, sourceKey, document, state, sha256({ document: rawDocument, state }), checks);
  }
  const unresolved = await queryRows<{ count: string }>(client, "SELECT count(*)::text AS count FROM migration_issues WHERE status = 'open'");
  push(checks, "migration_issues", Number(unresolved[0]?.count ?? -1), 0);
  return { sourceChecksum: sha256(Object.fromEntries(legacy)), checks };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage("npm run db:parity --", "Compares identities, timestamps, versions, locks, memberships, anchors, replies, history, resolution, verdicts, and semantic/plan fingerprints. Failed checks block cutover; --apply records only a safe manifest.");
    return;
  }
  const client = await connect(args.allowProduction);
  try {
    await withAdvisoryLock(client, "htmlcollab-legacy-parity-v1", async () => {
      const result = await verify(client);
      const manifest = { operation: "parity", mode: args.apply ? "apply" : "dry-run", ...result, passed: result.checks.every((check) => check.pass) };
      if (args.apply) {
        await client.query("INSERT INTO migration_manifests (operation, manifest_checksum, safe_manifest) VALUES ('parity', $1, $2::jsonb)", [sha256(manifest), JSON.stringify(manifest)]);
        if (manifest.passed) await client.query("UPDATE persistence_cutover_state SET last_parity_verified_at=now(), updated_at=now() WHERE singleton=TRUE");
      }
      writeManifest(manifest, args.manifestPath);
      if (!manifest.passed) process.exitCode = 2;
    });
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
