import type { PersistenceRepository } from "./repository";
import { createJsonPersistenceRepositoryFromEnvironment } from "./json";
import { createPostgresPoolFromEnvironment, PostgresPersistenceRepository } from "./postgres";
import { persistenceAdapterFromEnvironment } from "./startup";

/**
 * The only environment-driven adapter selection point. Call at process
 * startup, not lazily from an HTTP mutation, so a bad production deployment
 * fails closed before serving traffic. It never applies migrations or DDL.
 */
export async function createPersistenceRepositoryFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<PersistenceRepository> {
  if (persistenceAdapterFromEnvironment(environment) === "json") {
    return createJsonPersistenceRepositoryFromEnvironment(environment);
  }
  const repository = new PostgresPersistenceRepository(createPostgresPoolFromEnvironment(environment));
  await repository.assertReady();
  return repository;
}
