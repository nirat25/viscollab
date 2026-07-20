import { connect, ensureMigrationLedger, migrationFiles, parseArgs, printUsage, tableExists, withAdvisoryLock } from "./shared";

const APPLICATION_VERSION = process.env.APP_VERSION ?? "phase9";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage("npm run db:migrate --", "Pass --apply to execute pending SQL. --allow-production is mandatory for production-like targets.");
    return;
  }
  const client = await connect(args.allowProduction);
  try {
    await withAdvisoryLock(client, "htmlcollab-schema-migrations", async () => {
      const ledgerExists = await tableExists(client, "schema_migrations");
      if (args.apply && !ledgerExists) await ensureMigrationLedger(client);
      const applied = ledgerExists
        ? await client.query<{ migration_id: string; checksum: string }>("SELECT migration_id, checksum FROM schema_migrations ORDER BY migration_id")
        : { rows: [] as Array<{ migration_id: string; checksum: string }> };
      const appliedById = new Map(applied.rows.map((row) => [row.migration_id, row.checksum]));
      const pending = migrationFiles().filter((migration) => {
        const prior = appliedById.get(migration.id);
        if (prior && prior !== migration.checksum) throw new Error(`Checksum mismatch for applied migration ${migration.id}; do not edit committed migration files.`);
        return !prior;
      });
      if (!args.apply) {
        console.log(JSON.stringify({ mode: "dry-run", applied: applied.rows.length, pending: pending.map((migration) => migration.id) }, null, 2));
        return;
      }
      for (const migration of pending) {
        await client.query("BEGIN");
        try {
          await client.query(migration.sql);
          await client.query("INSERT INTO schema_migrations (migration_id, checksum, application_version) VALUES ($1, $2, $3)", [migration.id, migration.checksum, APPLICATION_VERSION]);
          await client.query("COMMIT");
          console.log(`Applied ${migration.id}`);
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    });
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
