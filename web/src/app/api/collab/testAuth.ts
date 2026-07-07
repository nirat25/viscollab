import type { Session } from "next-auth";

/**
 * Test-only session fallback.
 *
 * Several routes support running under Playwright without a real logged-in
 * session by synthesising a mock session. That bypass is a hard security risk
 * if `PLAYWRIGHT_TEST` ever leaks into a production environment, so it is gated
 * on BOTH `NODE_ENV !== "production"` AND `PLAYWRIGHT_TEST === "true"`. In
 * production this always returns null — the bypass is impossible.
 *
 * @param user Optional mock user identity (name/role/token) for the route.
 *             Defaults to the collaborator "Nirat".
 */
export function testSessionFallback(user?: {
  name: string;
  role: string;
  token: string;
}): Session | null {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.PLAYWRIGHT_TEST !== "true") return null;

  return {
    user: user ?? { name: "Nirat", role: "collaborator", token: "token-collaborator" },
    expires: "",
  };
}

/**
 * True only when the test-auth bypass is permitted (non-production Playwright
 * runs). Use this where a route wants to relax a check specifically for tests
 * (e.g. the reset route's owner-only guard) instead of reading the raw env var.
 */
export function isTestBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.PLAYWRIGHT_TEST === "true";
}
