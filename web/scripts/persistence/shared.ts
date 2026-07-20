import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Client, type QueryResultRow } from "pg";

export const MIGRATIONS_DIRECTORY = path.resolve(process.cwd(), "migrations");
export const LEGACY_JSON_DB = path.resolve(process.cwd(), "data", "db.json");
const DEFAULT_DATABASE_NAMES = new Set(["postgres", "template0", "template1"]);

export type ParsedArgs = {
  apply: boolean;
  allowProduction: boolean;
  manifestPath?: string;
  help: boolean;
};

export function parseArgs(args: string[]): ParsedArgs {
  const known = new Set(["--apply", "--allow-production", "--help", "-h"]);
  const unknown = args.find((argument) => !known.has(argument) && !argument.startsWith("--manifest="));
  if (unknown) throw new Error(`Unknown argument: ${unknown}`);
  const manifest = args.find((argument) => argument.startsWith("--manifest="));
  return {
    apply: args.includes("--apply"),
    allowProduction: args.includes("--allow-production"),
    manifestPath: manifest?.slice("--manifest=".length),
    help: args.includes("--help") || args.includes("-h"),
  };
}

export function printUsage(command: string, detail: string): void {
  console.log(`Usage: ${command} [--apply] [--allow-production] [--manifest=/absolute/path]`);
  console.log("Defaults to a read-only dry run. It requires DATABASE_URL and never reads or writes web/data/db.json.");
  console.log(detail);
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}

export function sha256(value: unknown): string {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

export function uuidFromSource(source: string): string {
  const bytes = Buffer.from(crypto.createHash("sha256").update(`htmlcollab-phase9:${source}`).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function assertSafeEnvironment(allowProduction: boolean): string {
  if (process.env.COLLAB_JSON_DB_PATH) throw new Error("Persistence tools refuse COLLAB_JSON_DB_PATH; they operate only on DATABASE_URL.");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required; the checked-in JSON development store is never a migration target.");
  const url = new URL(process.env.DATABASE_URL);
  const databaseName = url.pathname.replace(/^\//, "").split("/")[0];
  if (!databaseName || DEFAULT_DATABASE_NAMES.has(databaseName.toLowerCase())) {
    throw new Error(`Refusing default Postgres database target: ${databaseName || "(missing)"}. Use a dedicated database.`);
  }
  const productionLike = process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (productionLike && !allowProduction) {
    throw new Error("Refusing a production-like DATABASE_URL without --allow-production. Rehearse against a disposable staging database first.");
  }
  return process.env.DATABASE_URL;
}

export async function connect(allowProduction: boolean): Promise<Client> {
  const connectionString = assertSafeEnvironment(allowProduction);
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

export async function withAdvisoryLock<T>(client: Client, name: string, work: () => Promise<T>): Promise<T> {
  await client.query("SELECT pg_advisory_lock(hashtext($1))", [name]);
  try {
    return await work();
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [name]);
  }
}

export async function tableExists(client: Client, table: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>("SELECT to_regclass($1) IS NOT NULL AS exists", [`public.${table}`]);
  return result.rows[0]?.exists === true;
}

export function migrationFiles(): Array<{ id: string; sql: string; checksum: string }> {
  if (!fs.existsSync(MIGRATIONS_DIRECTORY)) throw new Error(`Migration directory is missing: ${MIGRATIONS_DIRECTORY}`);
  return fs.readdirSync(MIGRATIONS_DIRECTORY)
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/i.test(name))
    .sort()
    .map((id) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIRECTORY, id), "utf8");
      return { id, sql, checksum: sha256(sql) };
    });
}

export async function ensureMigrationLedger(client: Client): Promise<void> {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id TEXT PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    application_version TEXT NOT NULL
  )`);
}

export async function queryRows<T extends QueryResultRow>(client: Client, sql: string, values: unknown[] = []): Promise<T[]> {
  return (await client.query<T>(sql, values)).rows;
}

export function writeManifest(manifest: unknown, requestedPath?: string): void {
  const output = `${JSON.stringify(manifest, null, 2)}\n`;
  if (!requestedPath) {
    console.log(output);
    return;
  }
  const resolved = path.resolve(requestedPath);
  if (!path.isAbsolute(requestedPath)) throw new Error("--manifest must be an absolute path.");
  if (resolved === LEGACY_JSON_DB || resolved.startsWith(`${path.dirname(LEGACY_JSON_DB)}${path.sep}`)) {
    throw new Error("Refusing to write a migration manifest into web/data.");
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, output, { encoding: "utf8", flag: "wx" });
  console.log(`Wrote manifest: ${resolved}`);
}
