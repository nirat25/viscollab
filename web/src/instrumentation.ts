/**
 * Initialize and validate durable persistence when the Node server starts.
 * This performs read-only configuration/ledger checks; migrations remain an
 * explicit operator command and are never run from a request or startup hook.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }
}
