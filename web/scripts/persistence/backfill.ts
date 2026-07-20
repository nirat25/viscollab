import type { Client } from "pg";
import { validateSemanticArtifact } from "htmlcollab-app/semantic";
import { planVisuals, validateVisualPlan } from "htmlcollab-app/visual";
import type { SemanticArtifact } from "htmlcollab-app/semantic";
import type { VisualPlan } from "htmlcollab-app/visual";
import {
  connect,
  parseArgs,
  printUsage,
  queryRows,
  sha256,
  stableJson,
  tableExists,
  uuidFromSource,
  withAdvisoryLock,
  writeManifest,
} from "./shared";

type JsonObject = Record<string, unknown>;
type LegacyRow = { key: string; value: unknown };
type LegacyUser = { username: string; passwordSalt: string; passwordHash: string };
type PreparedDocument = {
  sourceKey: string;
  checksum: string;
  document: JsonObject;
  state: JsonObject;
  workspaceId: string;
  members: Array<{ accountId: string; role: "viewer" | "commenter" | "collaborator" | "owner" }>;
  kind: "legacy" | "decision_room";
  visualPlan?: VisualPlan;
};
type Issue = { sourceKey: string; checksum: string; reason: string; details: JsonObject };

const ROOM_ROLES = new Set(["viewer", "commenter", "collaborator", "owner"]);

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizedUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,127}$/.test(normalized) ? normalized : null;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function sourceTimestamp(value: unknown): string | undefined {
  const date = typeof value === "number" ? new Date(value) : typeof value === "string" ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? date.toISOString() : undefined;
}

function safeRole(value: unknown): "viewer" | "commenter" | "collaborator" | "owner" | null {
  return typeof value === "string" && ROOM_ROLES.has(value) ? value as "viewer" | "commenter" | "collaborator" | "owner" : null;
}

function safeVerdict(value: unknown): "approve" | "request_changes" | "block" | null {
  if (value === "approve" || value === "request_changes" || value === "block") return value;
  if (value === "request changes" || value === "changes") return "request_changes";
  return null;
}

function classify(state: JsonObject): { kind: "legacy" | "decision_room"; visualPlan?: VisualPlan } {
  const artifact = state.semanticArtifact;
  const artifactCheck = validateSemanticArtifact(artifact);
  if (!artifactCheck.valid) return { kind: "legacy" };
  const plan = state.visualPlan;
  const planCheck = plan && typeof plan === "object"
    ? validateVisualPlan(plan as VisualPlan, artifact as SemanticArtifact)
    : { valid: false };
  return {
    kind: "decision_room",
    visualPlan: planCheck.valid ? plan as VisualPlan : planVisuals(artifact as SemanticArtifact),
  };
}

function buildIssue(sourceKey: string, checksum: string, reason: string, details: JsonObject = {}): Issue {
  return { sourceKey, checksum, reason, details };
}

async function loadLegacy(client: Client): Promise<Map<string, unknown>> {
  if (!await tableExists(client, "collab_state")) {
    throw new Error("Legacy collab_state table does not exist. This tool only backfills an already-existing legacy Postgres store.");
  }
  const rows = await queryRows<LegacyRow>(client, "SELECT key, value FROM collab_state ORDER BY key");
  return new Map(rows.map((row) => [row.key, row.value]));
}

async function recordIssue(client: Client, issue: Issue): Promise<void> {
  await client.query(
    `INSERT INTO migration_issues (source_key, source_checksum, reason, safe_details)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (source_key, source_checksum, reason) DO NOTHING`,
    [issue.sourceKey, issue.checksum, issue.reason, JSON.stringify(issue.details)],
  );
}

function collectUsers(source: Map<string, unknown>): { users: LegacyUser[]; accountIds: Map<string, string>; issues: Issue[] } {
  const users: LegacyUser[] = [];
  const accountIds = new Map<string, string>();
  const issues: Issue[] = [];
  for (const [index, value] of asArray(source.get("users")).entries()) {
    const user = asObject(value);
    const sourceKey = `legacy:user:${index}`;
    const checksum = sha256(value);
    const username = normalizedUsername(user?.username);
    const passwordSalt = text(user?.passwordSalt);
    const passwordHash = text(user?.passwordHash);
    if (!username || !passwordSalt || !passwordHash) {
      issues.push(buildIssue(sourceKey, checksum, "invalid_legacy_account"));
      continue;
    }
    if (accountIds.has(username)) {
      issues.push(buildIssue(sourceKey, checksum, "normalized_username_collision", { username }));
      continue;
    }
    accountIds.set(username, uuidFromSource(`account:${username}`));
    users.push({ username, passwordSalt, passwordHash });
  }
  return { users, accountIds, issues };
}

function collectDocuments(source: Map<string, unknown>, accountIds: Map<string, string>): { documents: PreparedDocument[]; issues: Issue[] } {
  const documents: PreparedDocument[] = [];
  const issues: Issue[] = [];
  for (const rawDocument of asArray(source.get("documents"))) {
    const document = asObject(rawDocument);
    const legacyId = text(document?.id);
    const sourceKey = `legacy:document:${legacyId || "missing"}`;
    const state = legacyId ? asObject(source.get(`doc_${legacyId}`)) : null;
    const checksum = sha256({ document: rawDocument, state });
    if (!legacyId || !document || !state) {
      issues.push(buildIssue(sourceKey, checksum, "missing_document_metadata_or_state"));
      continue;
    }
    const workspaceId = text(document.workspaceId);
    const members: PreparedDocument["members"] = [];
    let invalid = false;
    for (const rawMember of asArray(document.members)) {
      const member = asObject(rawMember);
      const username = normalizedUsername(member?.username);
      const role = safeRole(member?.role);
      const accountId = username ? accountIds.get(username) : undefined;
      if (!accountId || !role) {
        issues.push(buildIssue(sourceKey, checksum, "unmappable_document_member", { username: username ?? "(invalid)", role: text(member?.role, "(invalid)") }));
        invalid = true;
        break;
      }
      members.push({ accountId, role });
    }
    if (!members.some((member) => member.role === "owner")) {
      issues.push(buildIssue(sourceKey, checksum, "document_has_no_direct_owner"));
      invalid = true;
    }
    const versions = asArray(state.versions);
    if (!versions.length || versions.some((version) => !asObject(version) || typeof asObject(version)?.html !== "string")) {
      issues.push(buildIssue(sourceKey, checksum, "invalid_or_missing_document_versions"));
      invalid = true;
    }
    const versionIds = new Set(versions.map((rawVersion, index) => {
      const version = asObject(rawVersion);
      const number = Number(version?.versionNumber) || index + 1;
      return text(version?.id) || `v${number}`;
    }));
    for (const rawVersion of versions) {
      const version = asObject(rawVersion);
      for (const actorField of ["createdBy", "publishedBy", "sourceLockedBy", "lockedBy"] as const) {
        if (version?.[actorField] === undefined) continue;
        const actor = normalizedUsername(version[actorField]);
        if (!actor || !accountIds.has(actor)) {
          issues.push(buildIssue(sourceKey, checksum, "unmappable_version_actor", { field: actorField, actor: actor ?? "(invalid)" }));
          invalid = true;
        }
      }
    }
    for (const commentValue of asArray(state.comments)) {
      const comment = asObject(commentValue);
      if (!comment) {
        issues.push(buildIssue(sourceKey, checksum, "invalid_comment"));
        invalid = true;
        break;
      }
      const author = normalizedUsername(comment?.author);
      if (!author || !accountIds.has(author)) {
        issues.push(buildIssue(sourceKey, checksum, "unmappable_comment_author", { author: author ?? "(invalid)" }));
        invalid = true;
        break;
      }
      if (!asObject(comment.target) || !text(comment.body).trim()) {
        issues.push(buildIssue(sourceKey, checksum, "invalid_comment_target_or_body"));
        invalid = true;
        break;
      }
      const commentVersionId = text(comment.versionId);
      if (!commentVersionId || !versionIds.has(commentVersionId)) {
        issues.push(buildIssue(sourceKey, checksum, "unknown_comment_version", { versionId: commentVersionId || "(missing)" }));
        invalid = true;
        break;
      }
      for (const replyValue of asArray(comment.replies)) {
        const reply = asObject(replyValue);
        if (!reply) {
          issues.push(buildIssue(sourceKey, checksum, "invalid_comment_reply"));
          invalid = true;
          break;
        }
        const replyAuthor = normalizedUsername(reply?.author);
        if (!replyAuthor || !accountIds.has(replyAuthor)) {
          issues.push(buildIssue(sourceKey, checksum, "unmappable_reply_author", { author: replyAuthor ?? "(invalid)" }));
          invalid = true;
          break;
        }
        if (!text(reply.body).trim()) {
          issues.push(buildIssue(sourceKey, checksum, "invalid_reply_body"));
          invalid = true;
          break;
        }
      }
      const resolution = asObject(comment.resolution);
      if (comment.lifecycle === "resolved") {
        const resolver = normalizedUsername(resolution?.resolvedBy);
        if (!resolver || !accountIds.has(resolver)) {
          issues.push(buildIssue(sourceKey, checksum, "unmappable_comment_resolver", { resolver: resolver ?? "(invalid)" }));
          invalid = true;
          break;
        }
      }
      for (const historyValue of asArray(comment.history)) {
        const history = asObject(historyValue);
        if (!history) {
          issues.push(buildIssue(sourceKey, checksum, "invalid_comment_history"));
          invalid = true;
          break;
        }
        const actor = normalizedUsername(history?.who);
        if (history?.who !== undefined && (!actor || !accountIds.has(actor))) {
          issues.push(buildIssue(sourceKey, checksum, "unmappable_comment_history_actor", { actor: actor ?? "(invalid)" }));
          invalid = true;
          break;
        }
      }
    }
    const verdicts = asObject(state.verdicts) ?? {};
    for (const [username, rawVerdict] of Object.entries(verdicts)) {
      if (rawVerdict === null || rawVerdict === undefined) continue;
      const normalized = normalizedUsername(username);
      if (!normalized || !accountIds.has(normalized) || !safeVerdict(rawVerdict)) {
        issues.push(buildIssue(sourceKey, checksum, "unmappable_or_invalid_verdict", { username: normalized ?? "(invalid)" }));
        invalid = true;
        break;
      }
    }
    if (invalid) continue;
    const classification = classify(state);
    documents.push({ sourceKey, checksum, document, state, workspaceId, members, ...classification });
  }
  return { documents, issues };
}

async function insertAccounts(client: Client, users: LegacyUser[], accountIds: Map<string, string>, apply: boolean): Promise<void> {
  for (const user of users) {
    if (!apply) continue;
    await client.query(
      `INSERT INTO accounts (id, username, username_normalized, password_hash, password_salt)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [accountIds.get(user.username), user.username, user.username, user.passwordHash, user.passwordSalt],
    );
  }
}

async function insertWorkspaces(client: Client, source: Map<string, unknown>, accountIds: Map<string, string>, apply: boolean): Promise<{ ids: Map<string, string>; issues: Issue[] }> {
  const ids = new Map<string, string>();
  const issues: Issue[] = [];
  for (const rawWorkspace of asArray(source.get("workspaces"))) {
    const workspace = asObject(rawWorkspace);
    if (!workspace) {
      issues.push(buildIssue("legacy:workspace:missing", sha256(rawWorkspace), "invalid_workspace"));
      continue;
    }
    const legacyId = text(workspace?.id);
    const sourceKey = `legacy:workspace:${legacyId || "missing"}`;
    const checksum = sha256(rawWorkspace);
    const ownerUsername = normalizedUsername(workspace?.createdBy);
    const ownerAccountId = ownerUsername ? accountIds.get(ownerUsername) : undefined;
    if (!legacyId || !ownerAccountId) {
      issues.push(buildIssue(sourceKey, checksum, "unmappable_workspace_owner"));
      continue;
    }
    let invalidMember = false;
    for (const rawMember of asArray(workspace.members)) {
      const member = asObject(rawMember);
      const memberName = normalizedUsername(member?.username);
      const memberRole = text(member?.role);
      if (!memberName || !accountIds.has(memberName) || !["owner", "member"].includes(memberRole)) {
        issues.push(buildIssue(sourceKey, checksum, "unmappable_workspace_member_or_role", { username: memberName ?? "(invalid)", role: memberRole || "(invalid)" }));
        invalidMember = true;
        break;
      }
      if (memberRole === "owner" && memberName !== ownerUsername) {
        issues.push(buildIssue(sourceKey, checksum, "multiple_or_conflicting_workspace_owner", { username: memberName }));
        invalidMember = true;
        break;
      }
    }
    if (invalidMember) continue;
    const id = uuidFromSource(`workspace:${legacyId}`);
    ids.set(legacyId, id);
    if (!apply) continue;
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO workspaces (id, legacy_source_key, name, owner_account_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT (legacy_source_key) DO NOTHING`,
        [id, sourceKey, text(workspace.name, "Untitled workspace"), ownerAccountId],
      );
      await client.query(
        `INSERT INTO workspace_members (workspace_id, account_id, role) VALUES ($1, $2, 'owner')
         ON CONFLICT (workspace_id, account_id) DO NOTHING`,
        [id, ownerAccountId],
      );
      for (const rawMember of asArray(workspace.members)) {
        const member = asObject(rawMember);
        const accountId = accountIds.get(normalizedUsername(member?.username) ?? "");
        if (!accountId) continue;
        await client.query(
          `INSERT INTO workspace_members (workspace_id, account_id, role) VALUES ($1, $2, $3::workspace_role)
           ON CONFLICT (workspace_id, account_id) DO NOTHING`,
          [id, accountId, accountId === ownerAccountId ? "owner" : "member"],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      ids.delete(legacyId);
      issues.push(buildIssue(sourceKey, checksum, "workspace_transaction_failed", { type: error instanceof Error ? error.name : "unknown" }));
    }
  }
  return { ids, issues };
}

async function insertDocument(client: Client, prepared: PreparedDocument, workspaceUuid: string, apply: boolean): Promise<"migrated" | "skipped" | "issue"> {
  const prior = await queryRows<{ source_checksum: string }>(client, "SELECT source_checksum FROM migration_sources WHERE source_key = $1", [prepared.sourceKey]);
  if (prior[0]?.source_checksum === prepared.checksum) return "skipped";
  if (prior.length) {
    await recordIssue(client, buildIssue(prepared.sourceKey, prepared.checksum, "source_checksum_changed_after_migration"));
    return "issue";
  }
  if (!apply) return "migrated";
  await client.query("BEGIN");
  try {
    const documentId = uuidFromSource(prepared.sourceKey);
    const title = text(prepared.document.name, "Untitled document");
    const owner = prepared.members.find((member) => member.role === "owner");
    if (!owner) throw new Error("validated document owner disappeared");
    const versions = asArray(prepared.state.versions).map(asObject);
    const activeVersionNumber = Number(prepared.state.activeVersionNum) || Number(versions.at(-1)?.versionNumber) || 1;
    await client.query(
      `INSERT INTO documents (id, legacy_source_key, workspace_id, kind, title, active_version_number, revision, created_at, updated_at)
       VALUES ($1, $2, $3, $4::document_kind, $5, $6, 0, COALESCE($7::timestamptz, now()), COALESCE($8::timestamptz, now()))`,
      [documentId, prepared.sourceKey, workspaceUuid, prepared.kind, title, activeVersionNumber, sourceTimestamp(prepared.document.createdAt), sourceTimestamp(prepared.state.updatedAt)],
    );
    for (const member of prepared.members) {
      await client.query("INSERT INTO room_members (document_id, account_id, role) VALUES ($1, $2, $3::room_role)", [documentId, member.accountId, member.role]);
    }
    const versionIdByLegacyId = new Map<string, string>();
    for (const [index, version] of versions.entries()) {
      if (!version) throw new Error("invalid version after validation");
      const number = Number(version.versionNumber) || index + 1;
      const legacyVersionId = text(version.id) || `v${number}`;
      const versionId = uuidFromSource(`${prepared.sourceKey}:version:${legacyVersionId}`);
      versionIdByLegacyId.set(legacyVersionId, versionId);
      const createdByName = normalizedUsername(version.createdBy);
      const createdBy = createdByName ? await accountIdFor(client, createdByName) : owner.accountId;
      const status = text(version.status).toLowerCase();
      const isPublished = status === "published" || status === "live";
      const publishedByName = normalizedUsername(version.publishedBy);
      const publishedBy = isPublished ? publishedByName ? await accountIdFor(client, publishedByName) : createdBy : undefined;
      const lockedAt = sourceTimestamp(version.sourceLockedAt) ?? sourceTimestamp(version.lockedAt);
      const lockedByName = normalizedUsername(version.sourceLockedBy) ?? normalizedUsername(version.lockedBy);
      const lockedBy = lockedAt ? lockedByName ? await accountIdFor(client, lockedByName) : createdBy : undefined;
      await client.query(
        `INSERT INTO document_versions
           (id, document_id, legacy_version_id, version_number, source_html, source_format,
            created_by_account_id, created_at, published_at, published_by_account_id,
            source_locked_at, source_locked_by_account_id)
         VALUES ($1, $2, $3, $4, $5, 'html', $6, COALESCE($7::timestamptz, now()),
                 $8::timestamptz, $9, $10::timestamptz, $11)`,
        [versionId, documentId, legacyVersionId, number, text(version.html), createdBy,
          sourceTimestamp(version.timestamp), isPublished ? sourceTimestamp(version.publishedAt) ?? sourceTimestamp(version.timestamp) : undefined,
          publishedBy, lockedAt, lockedBy],
      );
    }
    if (prepared.kind === "decision_room") {
      const artifact = prepared.state.semanticArtifact as JsonObject;
      await client.query("INSERT INTO semantic_artifacts (document_id, artifact, artifact_fingerprint) VALUES ($1, $2::jsonb, $3)", [documentId, JSON.stringify(artifact), sha256(artifact)]);
      await client.query("INSERT INTO visual_plans (document_id, plan, artifact_fingerprint) VALUES ($1, $2::jsonb, $3)", [documentId, JSON.stringify(prepared.visualPlan), sha256(artifact)]);
    }
    for (const rawComment of asArray(prepared.state.comments)) {
      const comment = asObject(rawComment)!;
      const authorName = normalizedUsername(comment.author)!;
      const authorAccountId = await accountIdFor(client, authorName);
      const legacyCommentId = text(comment.id) || sha256(rawComment).slice(0, 24);
      const threadId = uuidFromSource(`${prepared.sourceKey}:comment:${legacyCommentId}`);
      const resolution = asObject(comment.resolution);
      const resolvedBy = normalizedUsername(resolution?.resolvedBy);
      const resolvedByAccountId = resolvedBy ? await accountIdFor(client, resolvedBy) : undefined;
      const lifecycle = comment.lifecycle === "resolved" ? "resolved" : "open";
      if (lifecycle === "resolved" && !resolvedByAccountId) throw new Error("resolved comment without mapped resolver");
      await client.query(
        `INSERT INTO comment_threads (id, legacy_thread_id, document_id, version_id, author_account_id, target_payload, body, lifecycle, anchor_state, resolved_at, resolved_by_account_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::comment_lifecycle, $9::anchor_status, $10::timestamptz, $11, COALESCE($12::timestamptz, now()), COALESCE($13::timestamptz, now()))`,
        [threadId, legacyCommentId, documentId, versionIdByLegacyId.get(text(comment.versionId)), authorAccountId, JSON.stringify(asObject(comment.target) ?? {}), text(comment.body, "(legacy comment)"), lifecycle, comment.anchorStatus === "stale" || comment.anchorStatus === "orphaned" ? comment.anchorStatus : "anchored", lifecycle === "resolved" ? sourceTimestamp(resolution?.resolvedAt) ?? sourceTimestamp(comment.createdAt) : undefined, resolvedByAccountId, sourceTimestamp(comment.createdAt), sourceTimestamp(comment.createdAt)],
      );
      for (const [replyIndex, rawReply] of asArray(comment.replies).entries()) {
        const reply = asObject(rawReply)!;
        const replyAuthor = await accountIdFor(client, normalizedUsername(reply.author)!);
        const legacyReplyId = text(reply.id) || sha256(rawReply).slice(0, 24);
        await client.query(
          "INSERT INTO comment_replies (id, legacy_reply_id, thread_id, author_account_id, body, legacy_sequence, created_at) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))",
          [uuidFromSource(`${prepared.sourceKey}:reply:${legacyCommentId}:${legacyReplyId}`), legacyReplyId, threadId, replyAuthor, text(reply.body, "(legacy reply)"), replyIndex, sourceTimestamp(reply.ts) ?? sourceTimestamp(reply.createdAt)],
        );
      }
      for (const [historyIndex, rawHistory] of asArray(comment.history).entries()) {
        const history = asObject(rawHistory)!;
        const who = normalizedUsername(history.who);
        await client.query(
          "INSERT INTO comment_history (thread_id, actor_account_id, event_type, event_payload, legacy_sequence, created_at) VALUES ($1, $2, $3, $4::jsonb, $5, COALESCE($6::timestamptz, now()))",
          [threadId, who ? await accountIdFor(client, who) : undefined, text(history.event, "legacy_history"), JSON.stringify({ legacy: history }), historyIndex, sourceTimestamp(history.when)],
        );
      }
    }
    const verdicts = asObject(prepared.state.verdicts) ?? {};
    for (const [username, rawVerdict] of Object.entries(verdicts)) {
      const verdict = safeVerdict(rawVerdict);
      if (!verdict) continue;
      const accountId = await accountIdFor(client, normalizedUsername(username)!);
      await client.query("INSERT INTO verdicts (document_id, account_id, verdict) VALUES ($1, $2, $3::verdict_value)", [documentId, accountId, verdict]);
    }
    await client.query("INSERT INTO migration_sources (source_key, source_checksum, document_id) VALUES ($1, $2, $3)", [prepared.sourceKey, prepared.checksum, documentId]);
    await client.query(
      "INSERT INTO legacy_blob_mirror_receipts (document_id, source_key, document_revision, blob_checksum) VALUES ($1, $2, 0, $3)",
      [documentId, prepared.sourceKey, prepared.checksum],
    );
    await client.query("COMMIT");
    return "migrated";
  } catch (error) {
    await client.query("ROLLBACK");
    await recordIssue(client, buildIssue(prepared.sourceKey, prepared.checksum, "document_transaction_failed", { type: error instanceof Error ? error.name : "unknown" }));
    return "issue";
  }
}

async function accountIdFor(client: Client, username: string): Promise<string> {
  const accounts = await queryRows<{ id: string }>(client, "SELECT id FROM accounts WHERE username_normalized = $1", [username]);
  if (!accounts[0]) throw new Error("mapped account not found");
  return accounts[0].id;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage("npm run db:backfill --", "Validates legacy collab_state, emits a checksum manifest, and writes nothing unless --apply is set.");
    return;
  }
  const client = await connect(args.allowProduction);
  try {
    await withAdvisoryLock(client, "htmlcollab-legacy-backfill-v1", async () => {
      const source = await loadLegacy(client);
      const { users, accountIds, issues: userIssues } = collectUsers(source);
      const { documents, issues: documentIssues } = collectDocuments(source, accountIds);
      const issues = [...userIssues, ...documentIssues];
      const workspaceResult = await insertWorkspaces(client, source, accountIds, false);
      issues.push(...workspaceResult.issues);
      const readyDocuments = documents.filter((document) => {
        if (workspaceResult.ids.has(document.workspaceId)) return true;
        issues.push(buildIssue(document.sourceKey, document.checksum, "unmappable_document_workspace", { workspaceId: document.workspaceId }));
        return false;
      });
      const manifest = {
        operation: "backfill",
        mode: args.apply ? "apply" : "dry-run",
        sourceChecksum: sha256(Object.fromEntries(source)),
        accounts: users.length,
        documents: { eligible: readyDocuments.length, decisionRooms: readyDocuments.filter((document) => document.kind === "decision_room").length, legacy: readyDocuments.filter((document) => document.kind === "legacy").length },
        issues: issues.map((issue) => ({ sourceKey: issue.sourceKey, checksum: issue.checksum, reason: issue.reason, details: issue.details })),
      };
      if (!args.apply) {
        writeManifest(manifest, args.manifestPath);
        return;
      }
      for (const issue of issues) await recordIssue(client, issue);
      await insertAccounts(client, users, accountIds, true);
      const appliedWorkspaces = await insertWorkspaces(client, source, accountIds, true);
      for (const issue of appliedWorkspaces.issues) await recordIssue(client, issue);
      const results = { migrated: 0, skipped: 0, issue: issues.length };
      for (const document of readyDocuments) {
        const workspaceUuid = appliedWorkspaces.ids.get(document.workspaceId);
        if (!workspaceUuid) continue;
        const result = await insertDocument(client, document, workspaceUuid, true);
        results[result] += 1;
      }
      const persistedManifest = { ...manifest, results };
      await client.query("INSERT INTO migration_manifests (operation, manifest_checksum, safe_manifest) VALUES ('backfill', $1, $2::jsonb)", [sha256(persistedManifest), JSON.stringify(persistedManifest)]);
      writeManifest(persistedManifest, args.manifestPath);
    });
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
