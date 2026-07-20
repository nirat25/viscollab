-- Phase 9 durable persistence baseline.
-- Applied only by web/scripts/persistence/migrate.ts; never from an HTTP request.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  migration_id TEXT PRIMARY KEY,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  application_version TEXT NOT NULL
);

DO $$ BEGIN
  CREATE TYPE document_kind AS ENUM ('legacy', 'decision_room');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE room_role AS ENUM ('viewer', 'commenter', 'collaborator', 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE workspace_role AS ENUM ('member', 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE comment_lifecycle AS ENUM ('open', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE anchor_status AS ENUM ('anchored', 'stale', 'orphaned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE verdict_value AS ENUM ('approve', 'request_changes', 'block');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE migration_issue_status AS ENUM ('open', 'resolved', 'waived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (username_normalized = lower(username_normalized)),
  CHECK (length(username_normalized) BETWEEN 1 AND 128)
);

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_source_key TEXT UNIQUE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 512),
  owner_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  role workspace_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, account_id)
);

CREATE TABLE workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invitee_username_normalized TEXT NOT NULL,
  intended_role workspace_role NOT NULL DEFAULT 'member',
  status invitation_status NOT NULL DEFAULT 'pending',
  invited_by_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (invitee_username_normalized = lower(invitee_username_normalized)),
  CHECK ((status = 'accepted') = (accepted_by_account_id IS NOT NULL))
);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_source_key TEXT UNIQUE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  kind document_kind NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 2048),
  active_version_number INTEGER NOT NULL DEFAULT 0 CHECK (active_version_number >= 0),
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  archived_at TIMESTAMPTZ,
  archived_by_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((archived_at IS NULL) = (archived_by_account_id IS NULL))
);

CREATE TABLE room_members (
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  role room_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, account_id)
);

CREATE TABLE room_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  invitee_username_normalized TEXT NOT NULL,
  intended_role room_role NOT NULL,
  status invitation_status NOT NULL DEFAULT 'pending',
  invited_by_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (invitee_username_normalized = lower(invitee_username_normalized)),
  CHECK ((status = 'accepted') = (accepted_by_account_id IS NOT NULL))
);

CREATE TABLE document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  legacy_version_id TEXT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  source_html TEXT NOT NULL,
  source_format TEXT NOT NULL DEFAULT 'html',
  created_by_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  published_by_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  source_locked_at TIMESTAMPTZ,
  source_locked_by_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  derived_cache JSONB,
  UNIQUE (document_id, version_number),
  UNIQUE (document_id, legacy_version_id),
  CHECK (jsonb_typeof(derived_cache) IN ('object', NULL))
);

CREATE TABLE semantic_artifacts (
  document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  artifact JSONB NOT NULL,
  artifact_fingerprint CHAR(64) NOT NULL,
  semantic_schema_version INTEGER NOT NULL DEFAULT 1 CHECK (semantic_schema_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(artifact) = 'object')
);

CREATE TABLE visual_plans (
  document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  plan JSONB NOT NULL,
  artifact_fingerprint CHAR(64) NOT NULL,
  projection_schema_version INTEGER NOT NULL DEFAULT 1 CHECK (projection_schema_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(plan) = 'object')
);

CREATE TABLE comment_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_thread_id TEXT,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id UUID REFERENCES document_versions(id) ON DELETE RESTRICT,
  author_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  target_payload JSONB NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  lifecycle comment_lifecycle NOT NULL DEFAULT 'open',
  anchor_state anchor_status NOT NULL DEFAULT 'anchored',
  resolved_at TIMESTAMPTZ,
  resolved_by_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, legacy_thread_id),
  CHECK (jsonb_typeof(target_payload) = 'object'),
  CHECK ((lifecycle = 'resolved') = (resolved_at IS NOT NULL AND resolved_by_account_id IS NOT NULL))
);

CREATE TABLE comment_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_reply_id TEXT,
  thread_id UUID NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
  author_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  legacy_sequence INTEGER NOT NULL CHECK (legacy_sequence >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (thread_id, legacy_reply_id),
  UNIQUE (thread_id, legacy_sequence)
);

CREATE TABLE comment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
  actor_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 128),
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  legacy_sequence INTEGER NOT NULL CHECK (legacy_sequence >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(event_payload) = 'object'),
  UNIQUE (thread_id, legacy_sequence)
);

CREATE TABLE verdicts (
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  verdict verdict_value NOT NULL,
  rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, account_id),
  CHECK (rationale IS NULL OR length(rationale) <= 10000)
);

CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  actor_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  operation TEXT NOT NULL DEFAULT 'ask' CHECK (operation = 'ask'),
  model_name TEXT,
  preset TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed')),
  artifact_fingerprint CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (model_name IS NOT NULL)
);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT,
  document_id UUID REFERENCES documents(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 128),
  safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (workspace_id IS NOT NULL OR document_id IS NOT NULL),
  CHECK (jsonb_typeof(safe_metadata) = 'object')
);

CREATE TABLE migration_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL,
  source_checksum CHAR(64) NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 512),
  safe_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status migration_issue_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  UNIQUE (source_key, source_checksum, reason),
  CHECK (jsonb_typeof(safe_details) = 'object')
);

CREATE TABLE migration_sources (
  source_key TEXT PRIMARY KEY,
  source_checksum CHAR(64) NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE RESTRICT,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Application commands update this receipt only after the matching collab_state
-- mirror write succeeds. Rollback verification compares it to live blob checksums.
CREATE TABLE legacy_blob_mirror_receipts (
  document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL UNIQUE,
  document_revision BIGINT NOT NULL CHECK (document_revision >= 0),
  blob_checksum CHAR(64) NOT NULL,
  mirrored_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Operations changes read_mode only after parity/canary evidence. This is explicit
-- schema support for table-read canary + dual-write rollback; request DDL is forbidden.
CREATE TABLE persistence_cutover_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  read_mode TEXT NOT NULL DEFAULT 'blob' CHECK (read_mode IN ('blob', 'table')),
  dual_write_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_parity_verified_at TIMESTAMPTZ,
  last_rollback_verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO persistence_cutover_state (singleton, read_mode, dual_write_enabled)
VALUES (TRUE, 'blob', FALSE) ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE migration_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL CHECK (operation IN ('backfill', 'parity', 'rollback_verify')),
  manifest_checksum CHAR(64) NOT NULL,
  safe_manifest JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(safe_manifest) = 'object')
);

CREATE INDEX workspaces_owner_account_id_idx ON workspaces (owner_account_id);
CREATE INDEX workspace_members_account_id_idx ON workspace_members (account_id, workspace_id);
CREATE INDEX workspace_invitations_pending_idx ON workspace_invitations (invitee_username_normalized, expires_at) WHERE status = 'pending';
CREATE INDEX documents_workspace_id_idx ON documents (workspace_id, archived_at, updated_at DESC);
CREATE INDEX room_members_account_id_idx ON room_members (account_id, document_id);
CREATE INDEX room_invitations_pending_idx ON room_invitations (invitee_username_normalized, expires_at) WHERE status = 'pending';
CREATE INDEX document_versions_document_number_idx ON document_versions (document_id, version_number DESC);
CREATE INDEX comment_threads_document_lifecycle_idx ON comment_threads (document_id, lifecycle, created_at DESC);
CREATE INDEX comment_threads_author_idx ON comment_threads (author_account_id, created_at DESC);
CREATE INDEX comment_replies_thread_created_idx ON comment_replies (thread_id, created_at);
CREATE INDEX comment_history_thread_created_idx ON comment_history (thread_id, created_at);
CREATE INDEX verdicts_document_idx ON verdicts (document_id);
CREATE INDEX agent_runs_document_created_idx ON agent_runs (document_id, created_at DESC);
CREATE INDEX audit_events_document_created_idx ON audit_events (document_id, created_at DESC);
CREATE INDEX audit_events_workspace_created_idx ON audit_events (workspace_id, created_at DESC);
CREATE INDEX migration_issues_open_idx ON migration_issues (status, created_at) WHERE status = 'open';
CREATE INDEX migration_sources_document_id_idx ON migration_sources (document_id);
CREATE INDEX legacy_blob_mirror_receipts_freshness_idx ON legacy_blob_mirror_receipts (mirrored_at, document_revision);

-- Commit-time invariant: every surviving room has at least one direct owner.
-- DEFERRABLE permits create-document transactions to insert the document before
-- its owner membership, while still rejecting removal/demotion of the final owner.
CREATE FUNCTION enforce_room_has_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_document UUID;
BEGIN
  IF TG_TABLE_NAME = 'documents' THEN
    target_document := COALESCE(NEW.id, OLD.id);
  ELSE
    target_document := COALESCE(NEW.document_id, OLD.document_id);
  END IF;
  IF EXISTS (SELECT 1 FROM documents WHERE id = target_document)
     AND NOT EXISTS (
       SELECT 1 FROM room_members
       WHERE document_id = target_document AND role = 'owner'
     ) THEN
    RAISE EXCEPTION 'document % must retain at least one owner', target_document;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER documents_require_room_owner
AFTER INSERT OR UPDATE ON documents
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_room_has_owner();

CREATE CONSTRAINT TRIGGER room_members_retain_owner
AFTER INSERT OR UPDATE OR DELETE ON room_members
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_room_has_owner();

CREATE UNIQUE INDEX workspace_exactly_one_owner_idx
ON workspace_members (workspace_id) WHERE role = 'owner';

CREATE FUNCTION enforce_workspace_owner_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_workspace UUID;
BEGIN
  IF TG_TABLE_NAME = 'workspaces' THEN
    target_workspace := COALESCE(NEW.id, OLD.id);
  ELSE
    target_workspace := COALESCE(NEW.workspace_id, OLD.workspace_id);
  END IF;
  IF EXISTS (SELECT 1 FROM workspaces WHERE id = target_workspace)
     AND NOT EXISTS (
       SELECT 1 FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.workspace_id = target_workspace
         AND wm.account_id = w.owner_account_id
         AND wm.role = 'owner'
     ) THEN
    RAISE EXCEPTION 'workspace % owner must retain owner membership', target_workspace;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER workspaces_require_owner_membership
AFTER INSERT OR UPDATE ON workspaces
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_workspace_owner_membership();

CREATE CONSTRAINT TRIGGER workspace_members_retain_owner
AFTER INSERT OR UPDATE OR DELETE ON workspace_members
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_workspace_owner_membership();
