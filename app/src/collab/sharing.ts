/**
 * Compatibility affordances for pre-Phase-9 screens.
 *
 * They are deliberately role-only UI helpers, never authorization. Anonymous
 * share links/tokens were retired in Phase 9; routes must use
 * `persistence/authorize` with direct membership instead.
 */

import { capabilitiesForRole } from "../persistence/access.js";
import type { RoomRole } from "../persistence/types.js";

export type AccessRole = RoomRole;

/** @deprecated Use server-derived direct membership and `authorize` instead. */
export interface SharingCollabDoc { id: string; }

/** External/anonymous access is always denied. Internal UI affordances use role only. */
export function canView(_doc: SharingCollabDoc, role: unknown, isExternal = false): boolean {
  return !isExternal && capabilitiesForRole(role).includes("room.read");
}

/** Compatibility UI helper, not authorization. */
export function canComment(role: unknown): boolean {
  return capabilitiesForRole(role).includes("comment.create");
}

/** Compatibility UI helper, not authorization. */
export function canEdit(role: unknown): boolean {
  return capabilitiesForRole(role).includes("room.edit");
}

/** Compatibility UI helper, not authorization. */
export function canExportAgentData(role: unknown): boolean {
  return capabilitiesForRole(role).includes("agent.export");
}
