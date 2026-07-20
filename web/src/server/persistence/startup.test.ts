import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMigrationLedger,
  PersistenceStartupError,
  persistenceAdapterFromEnvironment,
} from "./startup";

function queryable(rows: Array<{ migration_id: string; checksum: string }> | Error, calls?: string[]) {
  return {
    async query<T>(text: string): Promise<{ rows: T[] }> {
      calls?.push(text);
      if (rows instanceof Error) throw rows;
      return { rows: rows as unknown as T[] };
    },
  };
}

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://decision-room.example/viscollab?sslmode=require",
  NEXTAUTH_SECRET: "test-secret",
} as NodeJS.ProcessEnv;

test("production persistence fails closed without Postgres, secret, or TLS policy", () => {
  assert.throws(() => persistenceAdapterFromEnvironment({ NODE_ENV: "production", NEXTAUTH_SECRET: "secret" }), PersistenceStartupError);
  assert.throws(() => persistenceAdapterFromEnvironment({ NODE_ENV: "production", DATABASE_URL: "postgresql://db.example/viscollab", NEXTAUTH_SECRET: "secret" }), /SSL/);
  assert.throws(() => persistenceAdapterFromEnvironment({ NODE_ENV: "production", DATABASE_URL: production.DATABASE_URL }), /NEXTAUTH_SECRET/);
  assert.equal(persistenceAdapterFromEnvironment(production), "postgres");
});

test("JSON is explicit local-only and has no silent adapter fallback", () => {
  assert.throws(() => persistenceAdapterFromEnvironment({ NODE_ENV: "test" }), /Set DATABASE_URL/);
  assert.equal(persistenceAdapterFromEnvironment({ NODE_ENV: "test", COLLAB_JSON_DB_PATH: "/tmp/viscollab-state.json" }), "json");
  assert.equal(persistenceAdapterFromEnvironment({ NODE_ENV: "test", DATABASE_URL: "postgresql://localhost/viscollab" }), "postgres");
});

test("migration ledger requires an exact checksummed manifest and performs no DDL", async () => {
  const expected = [{ id: "001_phase9.sql", checksum: "a".repeat(64) }];
  const calls: string[] = [];
  await assertMigrationLedger(queryable([{ migration_id: expected[0]!.id, checksum: expected[0]!.checksum }], calls), expected);
  assert.deepEqual(calls, ["SELECT migration_id, checksum FROM schema_migrations ORDER BY migration_id"]);
  await assert.rejects(assertMigrationLedger(queryable([]), expected), /exactly match/);
  await assert.rejects(assertMigrationLedger(queryable(new Error("missing relation")), expected), /unavailable or incomplete/);
});
