/** Public framework-free Phase-9 contracts. Server adapters live in web. */
export type {
  AccountId, WorkspaceId, DocumentId, Account, SessionIdentity, RoomRole, WorkspaceRole,
  RoomMembership, WorkspaceMembership, Capability, AuthorizationContext, AuthorizationResource,
  AuthorizationSubject, DocumentKind, VersionStatus, DerivedCacheSnapshot,
  DocumentVersionSnapshot, CommentThreadSnapshot, OwnableVerdictSnapshot, DocumentStateV2,
  RevisionConflict, RevisionCheck, CommandInput, CreateCommentInput, ReplyToCommentInput,
  ResolveCommentInput, ReopenCommentInput, SetOwnVerdictInput, CreateVersionInput,
  EditVersionInput, RegenerateVersionInput, PublishVersionInput, LockSourceInput,
  AnyNarrowCommandInput, LegacyDocumentRecord, LegacyMigrationResult,
} from "./types.js";
export { capabilitiesForRole, authorize, canAuthorizeAny } from "./access.js";
export { isUuid, normalizeUsername, validateAccount, sessionIdentity } from "./identity.js";
export type { StateValidationResult } from "./state.js";
export {
  canonicalJson, fingerprintSemanticArtifact, validateDerivedCache, rebuildDerivedCache,
  usableDerivedCache, currentVisualPlan, checkExpectedRevision, validateDocumentStateV2,
} from "./state.js";
export { migrateLegacyDocumentState } from "./migration.js";
