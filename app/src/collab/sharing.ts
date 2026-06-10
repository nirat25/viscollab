export type AccessRole = 'owner' | 'collaborator' | 'viewer' | 'commenter' | 'comment';

export interface SharingCollabDoc {
  id: string;
  status?: 'Draft' | 'Live';
  versionStatus?: 'Draft' | 'Live';
}

export interface ShareToken {
  token: string;
  docId: string;
  role: AccessRole;
  isRevoked: boolean;
  expiresAt?: Date;
}

// In-memory registry for tracking share tokens and link revocation
const tokenRegistry = new Map<string, ShareToken>();

/**
 * Clears the registered tokens. Primarily used for resetting test states.
 */
export function clearTokens(): void {
  tokenRegistry.clear();
}

/**
 * Registers a share token.
 */
export function registerToken(token: ShareToken): void {
  tokenRegistry.set(token.token, token);
}

/**
 * Revokes a share token immediately.
 */
export function revokeToken(token: string): void {
  const t = tokenRegistry.get(token);
  if (t) {
    t.isRevoked = true;
  }
}

/**
 * Check if a share token is valid (not revoked and not expired).
 */
export function isTokenValid(token: string): boolean {
  const t = tokenRegistry.get(token);
  if (!t) return false;
  if (t.isRevoked) return false;
  if (t.expiresAt && t.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

/**
 * Validates a share token and returns it if valid, otherwise throws an error.
 */
export function validateTokenAccess(token: string): ShareToken {
  const t = tokenRegistry.get(token);
  if (!t) {
    throw new Error('Access denied: Share token not found');
  }
  if (t.isRevoked) {
    throw new Error('Access denied: Share token has been revoked');
  }
  if (t.expiresAt && t.expiresAt.getTime() <= Date.now()) {
    throw new Error('Access denied: Share token has expired');
  }
  return t;
}

/**
 * Guard to check if a user with a given role can view a document.
 * Draft versions are never shareable externally.
 */
export function canView(doc: SharingCollabDoc, role: AccessRole, isExternal: boolean): boolean {
  const status = doc.versionStatus || doc.status;
  if (status === 'Draft' && isExternal) {
    return false;
  }
  return ['owner', 'collaborator', 'viewer', 'commenter', 'comment'].includes(role);
}

/**
 * Guard to check if a user with a given role can comment on a document.
 * Viewers are blocked from commenting.
 */
export function canComment(role: AccessRole): boolean {
  if (role === 'viewer') {
    return false;
  }
  return ['owner', 'collaborator', 'commenter', 'comment'].includes(role);
}

/**
 * Guard to check if a user with a given role can edit/regenerate a document.
 * Only owners and collaborators can edit.
 */
export function canEdit(role: AccessRole): boolean {
  return ['owner', 'collaborator'].includes(role);
}

/**
 * Guard to check if a user can generate a share link for a document.
 * External users are blocked from generating share links for Drafts.
 */
export function canGenerateShareLink(doc: SharingCollabDoc, isExternal: boolean): boolean {
  const status = doc.versionStatus || doc.status;
  if (status === 'Draft' && isExternal) {
    return false;
  }
  return !isExternal;
}
