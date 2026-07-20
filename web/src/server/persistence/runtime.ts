import type { PersistenceRepository } from "./repository";
import { createPersistenceRepositoryFromEnvironment } from "./factory";

let repositoryPromise: Promise<PersistenceRepository> | undefined;

/** Process-local adapter initialization. Configuration is validated by the factory. */
export function persistenceRepository(): Promise<PersistenceRepository> {
  repositoryPromise ??= createPersistenceRepositoryFromEnvironment();
  return repositoryPromise;
}

/** Test-only reset so route/service tests can establish an isolated adapter. */
export function resetPersistenceRepositoryForTests(): void {
  repositoryPromise = undefined;
}
