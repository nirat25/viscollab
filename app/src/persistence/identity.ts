/** Immutable account identity helpers. Usernames are normalized display/login data only. */

import type { Account, SessionIdentity } from "./types.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function normalizeUsername(username: unknown): string | null {
  if (typeof username !== "string") return null;
  const normalized = username.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  return normalized === "" ? null : normalized;
}

export function validateAccount(account: unknown): account is Account {
  if (!account || typeof account !== "object" || Array.isArray(account)) return false;
  const value = account as Record<string, unknown>;
  const normalized = normalizeUsername(value.username);
  return isUuid(value.id)
    && normalized !== null && value.normalizedUsername === normalized
    && typeof value.passwordHash === "string" && value.passwordHash !== ""
    && typeof value.createdAt === "string" && typeof value.updatedAt === "string";
}

/** Session projections never carry password hashes, roles, or anonymous tokens. */
export function sessionIdentity(account: Pick<Account, "id" | "username">): SessionIdentity {
  return { accountId: account.id, username: account.username };
}
