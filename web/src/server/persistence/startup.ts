import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { QueryResultRow } from "pg";

/** A deliberately small query surface so startup checks are unit-testable. */
export interface SqlQueryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

export interface MigrationChecksum {
  id: string;
  checksum: string;
}

export class PersistenceStartupError extends Error {
  override name = "PersistenceStartupError";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Read-only migration manifest. Applying migrations belongs to the CLI only. */
const MODULE_MIGRATIONS_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../migrations");

export function expectedMigrationChecksums(migrationsDirectory = process.env.PHASE9_MIGRATIONS_DIR ?? MODULE_MIGRATIONS_DIRECTORY): readonly MigrationChecksum[] {
  try {
    return readdirSync(migrationsDirectory)
      .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/i.test(name))
      .sort()
      .map((id) => ({ id, checksum: sha256(readFileSync(path.join(migrationsDirectory, id), "utf8")) }));
  } catch (error) {
    throw new PersistenceStartupError(`Unable to read the committed migration manifest: ${(error as Error).message}`);
  }
}

export function sslModeForEnvironment(environment: NodeJS.ProcessEnv = process.env): "disable" | "require" | "verify-full" {
  const explicit = environment.DATABASE_SSL_MODE;
  if (explicit === "disable" || explicit === "require" || explicit === "verify-full") return explicit;
  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl) {
    try {
      const fromUrl = new URL(databaseUrl).searchParams.get("sslmode");
      if (fromUrl === "disable" || fromUrl === "require" || fromUrl === "verify-full") return fromUrl;
    } catch {
      // validatePersistenceEnvironment provides the clearer DATABASE_URL error.
    }
  }
  return "disable";
}

/**
 * Selects an adapter without opening a connection. Production must be
 * Postgres-only, must have a secret, and must state an encrypted SSL policy.
 */
export function persistenceAdapterFromEnvironment(environment: NodeJS.ProcessEnv = process.env): "postgres" | "json" {
  const production = environment.NODE_ENV === "production";
  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
        throw new Error("DATABASE_URL must use the postgres protocol");
      }
    } catch (error) {
      throw new PersistenceStartupError(`Invalid DATABASE_URL: ${(error as Error).message}`);
    }
    if (production) {
      if (!environment.NEXTAUTH_SECRET) throw new PersistenceStartupError("NEXTAUTH_SECRET is required when NODE_ENV=production");
      if (sslModeForEnvironment(environment) === "disable") {
        throw new PersistenceStartupError("Production Postgres requires DATABASE_SSL_MODE=require or verify-full (or matching sslmode in DATABASE_URL)");
      }
    }
    return "postgres";
  }
  if (production) throw new PersistenceStartupError("DATABASE_URL is required when NODE_ENV=production; JSON persistence is forbidden");
  if (!environment.COLLAB_JSON_DB_PATH) throw new PersistenceStartupError("Set DATABASE_URL or explicit COLLAB_JSON_DB_PATH; there is no implicit persistence fallback");
  return "json";
}

/** Fails closed on a missing, extra, or modified migration. It never runs DDL. */
export async function assertMigrationLedger(
  database: SqlQueryable,
  expected: readonly MigrationChecksum[] = expectedMigrationChecksums(),
): Promise<void> {
  let rows: Array<{ migration_id: string; checksum: string }>;
  try {
    rows = (await database.query<{ migration_id: string; checksum: string }>(
      "SELECT migration_id, checksum FROM schema_migrations ORDER BY migration_id",
    )).rows;
  } catch (error) {
    throw new PersistenceStartupError(`Migration ledger is unavailable or incomplete: ${(error as Error).message}`);
  }
  const actual = new Map(rows.map((row) => [row.migration_id, row.checksum]));
  if (actual.size !== rows.length) throw new PersistenceStartupError("Migration ledger contains duplicate migration IDs");
  if (actual.size !== expected.length) throw new PersistenceStartupError("Migration ledger does not exactly match committed migrations");
  for (const migration of expected) {
    if (actual.get(migration.id) !== migration.checksum) {
      throw new PersistenceStartupError(`Migration ledger checksum mismatch: ${migration.id}`);
    }
  }
}
