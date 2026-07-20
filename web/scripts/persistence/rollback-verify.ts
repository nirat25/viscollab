import { connect, parseArgs, printUsage, queryRows, sha256, tableExists, withAdvisoryLock, writeManifest } from "./shared";

type JsonObject = Record<string, unknown>;
type LegacyRow = { key: string; value: unknown };
type Check = { name: string; pass: boolean; detail?: unknown };

const object = (value: unknown): JsonObject | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const time = (value: unknown): number => value ? new Date(value as string | number).valueOf() : Number.NaN;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage("npm run db:rollback-verify --", "Verifies blob mirror checksums, revision receipts, freshness, cutover flags, and parity evidence. It never switches reads, drops schema, or deletes table data.");
    return;
  }
  const client = await connect(args.allowProduction);
  try {
    await withAdvisoryLock(client, "htmlcollab-rollback-verify-v1", async () => {
      const required = ["collab_state", "migration_sources", "legacy_blob_mirror_receipts", "persistence_cutover_state"];
      const presence = new Map<string, boolean>();
      for (const table of required) presence.set(table, await tableExists(client, table));
      const checks: Check[] = required.map((table) => ({ name: `table:${table}`, pass: presence.get(table) === true }));
      if (!checks.every((check) => check.pass)) {
        const manifest = { operation: "rollback_verify", mode: args.apply ? "apply" : "dry-run", checks, passed: false };
        writeManifest(manifest, args.manifestPath);
        process.exitCode = 2;
        return;
      }

      const legacyRows = await queryRows<LegacyRow>(client, "SELECT key,value FROM collab_state ORDER BY key");
      const legacy = new Map(legacyRows.map((row) => [row.key, row.value]));
      const currentBlobChecksums = new Map<string, string>();
      for (const rawDocument of array(legacy.get("documents"))) {
        const document = object(rawDocument);
        const id = typeof document?.id === "string" ? document.id : "";
        if (!id) continue;
        currentBlobChecksums.set(`legacy:document:${id}`, sha256({ document: rawDocument, state: object(legacy.get(`doc_${id}`)) }));
      }
      const receipts = await queryRows<{ source_key: string; blob_checksum: string; document_revision: string; current_revision: string; mirrored_at: unknown; document_updated_at: unknown }>(client, `
        SELECT r.source_key,r.blob_checksum,r.document_revision::text,
          d.revision::text AS current_revision,r.mirrored_at,d.updated_at AS document_updated_at
        FROM legacy_blob_mirror_receipts r JOIN documents d ON d.id=r.document_id
        ORDER BY r.source_key`);
      checks.push({ name: "receipt_count", pass: receipts.length === currentBlobChecksums.size, detail: { receipts: receipts.length, blobDocuments: currentBlobChecksums.size } });
      for (const receipt of receipts) {
        const blobChecksum = currentBlobChecksums.get(receipt.source_key);
        checks.push({ name: `${receipt.source_key}:blob_checksum`, pass: Boolean(blobChecksum) && receipt.blob_checksum === blobChecksum });
        checks.push({ name: `${receipt.source_key}:revision`, pass: receipt.document_revision === receipt.current_revision, detail: { mirrored: receipt.document_revision, current: receipt.current_revision } });
        checks.push({ name: `${receipt.source_key}:freshness`, pass: time(receipt.mirrored_at) >= time(receipt.document_updated_at), detail: { mirroredAt: receipt.mirrored_at, documentUpdatedAt: receipt.document_updated_at } });
      }
      const openIssues = (await queryRows<{ count: string }>(client, "SELECT count(*)::text AS count FROM migration_issues WHERE status='open'"))[0];
      checks.push({ name: "no_open_migration_issues", pass: Number(openIssues?.count ?? -1) === 0, detail: { count: openIssues?.count } });
      const cutover = (await queryRows<{ read_mode: string; dual_write_enabled: boolean; last_parity_verified_at: unknown }>(client, "SELECT read_mode,dual_write_enabled,last_parity_verified_at FROM persistence_cutover_state WHERE singleton=TRUE"))[0];
      checks.push({ name: "cutover_state_present", pass: Boolean(cutover) });
      checks.push({ name: "table_reads_require_dual_write", pass: cutover?.read_mode !== "table" || cutover.dual_write_enabled === true, detail: cutover });
      checks.push({ name: "table_reads_require_parity_evidence", pass: cutover?.read_mode !== "table" || Boolean(cutover.last_parity_verified_at) });

      const manifest = { operation: "rollback_verify", mode: args.apply ? "apply" : "dry-run", checks, passed: checks.every((check) => check.pass) };
      if (args.apply) {
        await client.query("INSERT INTO migration_manifests (operation, manifest_checksum, safe_manifest) VALUES ('rollback_verify', $1, $2::jsonb)", [sha256(manifest), JSON.stringify(manifest)]);
        if (manifest.passed) await client.query("UPDATE persistence_cutover_state SET last_rollback_verified_at=now(), updated_at=now() WHERE singleton=TRUE");
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
