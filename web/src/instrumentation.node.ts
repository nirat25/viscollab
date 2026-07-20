import { persistenceRepository } from "./server/persistence/runtime";

// Node-only startup side effect. Keeping this in the conventional
// instrumentation.node module prevents the Edge instrumentation bundle from
// traversing the pg driver's Node-only fs/TLS imports.
await persistenceRepository();
