import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/options";
import {
  CommandAuthorizationError,
  CommandResourceNotFoundError,
  CommandStateError,
  CommandValidationError,
  DocumentNotFoundError,
  RoomAccessDeniedError,
  persistenceRepository,
} from "@/server/persistence";
import type { AccountId } from "htmlcollab-app/persistence";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

export { persistenceRepository };

/**
 * Accounts are mandatory.  The auth migration adds `accountId` to Session.user;
 * keep this structural read here so route compilation stays ordered-independent.
 */
export async function sessionAccountId(): Promise<AccountId | null> {
  const session = await getServerSession(authOptions);
  const accountId = (session?.user as { accountId?: unknown } | undefined)?.accountId;
  return typeof accountId === "string" && accountId.trim() !== "" ? accountId : null;
}

export function noStore(body: unknown, status = 200, headers?: HeadersInit): NextResponse {
  return NextResponse.json(body, { status, headers: { ...NO_STORE_HEADERS, ...headers } });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(value: unknown, maximum = 200): string | null {
  return typeof value === "string" && value.trim() !== "" && value.length <= maximum ? value.trim() : null;
}

export function expectedRevision(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Stable HTTP translation for domain errors. Never leak storage/provider detail. */
export function persistenceErrorResponse(error: unknown): NextResponse {
  if (error instanceof DocumentNotFoundError || error instanceof CommandResourceNotFoundError) {
    return noStore({ error: error.code }, 404);
  }
  if (error instanceof RoomAccessDeniedError || error instanceof CommandAuthorizationError) {
    return noStore({ error: "forbidden" }, 403);
  }
  if (error instanceof CommandValidationError) return noStore({ error: "invalid_request" }, 400);
  if (error instanceof CommandStateError) return noStore({ error: error.code }, 409);
  return noStore({ error: "persistence_unavailable" }, 503);
}

export function revisionConflict(currentRevision: number): NextResponse {
  return noStore({ error: "revision_conflict", code: "revision_conflict", currentRevision }, 409);
}
