import { describe, it, expect, beforeEach } from 'vitest';
import {
  canView,
  canComment,
  canEdit,
  canGenerateShareLink,
  clearTokens,
  registerToken,
  revokeToken,
  isTokenValid,
  validateTokenAccess,
  type AccessRole,
  type SharingCollabDoc,
  type ShareToken
} from '../../src/collab/sharing.js';

describe('Sharing & Permissions', () => {
  beforeEach(() => {
    clearTokens();
  });

  describe('Role capability guards', () => {
    it('should block viewers from commenting and editing', () => {
      expect(canComment('viewer')).toBe(false);
      expect(canEdit('viewer')).toBe(false);
    });

    it('should allow commenters to comment but block them from editing', () => {
      expect(canComment('commenter')).toBe(true);
      expect(canComment('comment')).toBe(true);
      expect(canEdit('commenter')).toBe(false);
      expect(canEdit('comment')).toBe(false);
    });

    it('should allow owners and collaborators to comment and edit', () => {
      expect(canComment('owner')).toBe(true);
      expect(canComment('collaborator')).toBe(true);
      expect(canEdit('owner')).toBe(true);
      expect(canEdit('collaborator')).toBe(true);
    });
  });

  describe('Draft leakage protection', () => {
    const draftDoc: SharingCollabDoc = { id: 'doc-1', status: 'Draft' };
    const draftDocAlt: SharingCollabDoc = { id: 'doc-1-alt', versionStatus: 'Draft' };
    const liveDoc: SharingCollabDoc = { id: 'doc-2', status: 'Live' };

    it('should block external users from viewing draft docs', () => {
      expect(canView(draftDoc, 'viewer', true)).toBe(false);
      expect(canView(draftDocAlt, 'viewer', true)).toBe(false);
      expect(canView(draftDoc, 'collaborator', true)).toBe(false);
    });

    it('should allow internal users to view draft docs', () => {
      expect(canView(draftDoc, 'viewer', false)).toBe(true);
      expect(canView(draftDocAlt, 'viewer', false)).toBe(true);
      expect(canView(draftDoc, 'collaborator', false)).toBe(true);
    });

    it('should allow external users to view live docs', () => {
      expect(canView(liveDoc, 'viewer', true)).toBe(true);
      expect(canView(liveDoc, 'collaborator', true)).toBe(true);
    });

    it('should block external users from generating share links for drafts', () => {
      expect(canGenerateShareLink(draftDoc, true)).toBe(false);
      expect(canGenerateShareLink(draftDocAlt, true)).toBe(false);
    });

    it('should allow internal users to generate share links for drafts', () => {
      expect(canGenerateShareLink(draftDoc, false)).toBe(true);
      expect(canGenerateShareLink(draftDocAlt, false)).toBe(true);
    });

    it('should allow internal users to generate share links for live docs', () => {
      expect(canGenerateShareLink(liveDoc, false)).toBe(true);
    });
  });

  describe('Link revocation & token validation', () => {
    const tokenStr = 'test-token-xyz';
    const docId = 'doc-1';
    
    it('should validate active token successfully', () => {
      const token: ShareToken = {
        token: tokenStr,
        docId,
        role: 'viewer',
        isRevoked: false
      };
      registerToken(token);
      
      expect(isTokenValid(tokenStr)).toBe(true);
      expect(validateTokenAccess(tokenStr)).toEqual(token);
    });

    it('should immediately reject a revoked token', () => {
      const token: ShareToken = {
        token: tokenStr,
        docId,
        role: 'viewer',
        isRevoked: false
      };
      registerToken(token);
      expect(isTokenValid(tokenStr)).toBe(true);
      
      // Revoke the token
      revokeToken(tokenStr);
      
      expect(isTokenValid(tokenStr)).toBe(false);
      expect(() => validateTokenAccess(tokenStr)).toThrow('revoked');
    });

    it('should immediately reject an expired token', () => {
      const expiredDate = new Date(Date.now() - 10000); // 10s in the past
      const token: ShareToken = {
        token: tokenStr,
        docId,
        role: 'viewer',
        isRevoked: false,
        expiresAt: expiredDate
      };
      registerToken(token);
      
      expect(isTokenValid(tokenStr)).toBe(false);
      expect(() => validateTokenAccess(tokenStr)).toThrow('expired');
    });

    it('should accept non-expired token with future expiry', () => {
      const futureDate = new Date(Date.now() + 10000); // 10s in the future
      const token: ShareToken = {
        token: tokenStr,
        docId,
        role: 'viewer',
        isRevoked: false,
        expiresAt: futureDate
      };
      registerToken(token);
      
      expect(isTokenValid(tokenStr)).toBe(true);
      expect(validateTokenAccess(tokenStr)).toEqual(token);
    });

    it('should reject non-existent token', () => {
      expect(isTokenValid('non-existent')).toBe(false);
      expect(() => validateTokenAccess('non-existent')).toThrow('not found');
    });
  });
});
