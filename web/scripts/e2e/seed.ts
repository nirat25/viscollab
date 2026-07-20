/**
 * Non-HTTP Phase-9 E2E fixture ingress.
 *
 * This intentionally refuses to run unless an operator opts in with both
 * E2E_MODE=true and an absolute temporary JSON database path outside the
 * repository. It uses the real persistence adapter and scrypt password hashes
 * so browser coverage exercises the normal credentials flow—never a reset
 * endpoint or test-session bypass.
 */
import { createHash } from "node:crypto";
import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { JsonPersistenceRepository } from "../../src/server/persistence";
import { hashPassword } from "../../src/server/auth/password";
import { heuristicExtract } from "htmlcollab-app/semantic";
import { planVisuals } from "htmlcollab-app/visual";
import type { DocumentStateV2 } from "htmlcollab-app/persistence";
import type { PersistedSnapshot } from "../../src/server/persistence";

const NOW = "2026-07-20T12:00:00.000Z";
const PASSWORD = "phase9-e2e-password";
const IDS = {
  owner: "10000000-0000-4000-8000-000000000001",
  collaborator: "10000000-0000-4000-8000-000000000002",
  commenter: "10000000-0000-4000-8000-000000000003",
  viewer: "10000000-0000-4000-8000-000000000004",
  workspace: "10000000-0000-4000-8000-000000000010",
  semanticRoom: "10000000-0000-4000-8000-000000000020",
  legacyRoom: "10000000-0000-4000-8000-000000000021",
} as const;

async function assertE2eEnvironment(): Promise<string> {
  if (process.env.E2E_MODE !== "true") throw new Error("Refusing E2E seed: E2E_MODE=true is required");
  if (process.env.NODE_ENV === "production") throw new Error("Refusing E2E seed in production");
  const configured = process.env.COLLAB_JSON_DB_PATH;
  const outputConfigured = process.env.E2E_OUTPUT_DIR;
  if (!configured || !path.isAbsolute(configured) || !outputConfigured || !path.isAbsolute(outputConfigured)) {
    throw new Error("Refusing E2E seed: E2E_OUTPUT_DIR and COLLAB_JSON_DB_PATH must be explicit and absolute");
  }
  const outputDir = path.resolve(outputConfigured);
  const filePath = path.resolve(configured);
  const forbidden = path.resolve(process.cwd(), "data", "db.json");
  if (filePath === forbidden || filePath.endsWith(`${path.sep}web${path.sep}data${path.sep}db.json`)) {
    throw new Error("Refusing E2E seed: checked-in web/data/db.json is never a test target");
  }
  // A temp location prevents this script being pointed at a developer's local
  // fixture by accident. CI may use the OS temp directory on any platform.
  const tempRoots = [process.env.TMPDIR, "/tmp", "/private/tmp"].filter((value): value is string => Boolean(value)).map((value) => path.resolve(value));
  const isDescendant = (candidate: string, parent: string) => {
    const relative = path.relative(parent, candidate);
    return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
  };
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  if ((await lstat(outputDir)).isSymbolicLink()) throw new Error("Refusing E2E seed: E2E_OUTPUT_DIR may not be a symlink");
  const realOutputDir = await realpath(outputDir);
  if (!tempRoots.some((tempRoot) => realOutputDir === tempRoot || isDescendant(realOutputDir, tempRoot))) {
    throw new Error("Refusing E2E seed: E2E_OUTPUT_DIR must live under the OS temp directory");
  }
  if (!isDescendant(filePath, outputDir)) {
    throw new Error("Refusing E2E seed: COLLAB_JSON_DB_PATH must be under E2E_OUTPUT_DIR");
  }
  try {
    if ((await lstat(filePath)).isSymbolicLink()) throw new Error("Refusing E2E seed: database path may not be a symlink");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return path.join(realOutputDir, path.relative(outputDir, filePath));
}

function account(id: string, username: string) {
  return { id, username, normalizedUsername: username.toLowerCase(), passwordHash: hashPassword(PASSWORD), createdAt: NOW, updatedAt: NOW };
}

function semanticState(): DocumentStateV2 {
  const artifact = heuristicExtract({
    type: "doc",
    sourceFile: "e2e-strategy.html",
    docType: "auto",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "E2E strategy decision" }] },
      { type: "paragraph", attrs: {}, content: [{ type: "text", text: "Approve the staged rollout after reviewing its customer and delivery risks." }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Next actions" }] },
      { type: "bulletList", attrs: {}, content: [{ type: "listItem", attrs: {}, content: [{ type: "paragraph", attrs: {}, content: [{ type: "text", text: "Validate owner feedback before launch" }] }] }] },
    ],
  });
  return {
    schemaVersion: 2, documentId: IDS.semanticRoom, workspaceId: IDS.workspace, kind: "decision_room", revision: 0,
    title: artifact.title, activeVersionNumber: 1,
    versions: [{ id: "semantic-v1", versionNumber: 1, html: "<main id=\"decision\"><h1>E2E strategy decision</h1><p>Approve the staged rollout after reviewing its customer and delivery risks.</p></main>", status: "Draft", createdAt: NOW }],
    comments: [], verdicts: [], semanticArtifact: artifact, visualPlan: planVisuals(artifact), capabilities: [],
  };
}

function legacyState(): DocumentStateV2 {
  return {
    schemaVersion: 2, documentId: IDS.legacyRoom, workspaceId: IDS.workspace, kind: "legacy", revision: 0,
    title: "E2E legacy document", activeVersionNumber: 1,
    versions: [{ id: "legacy-v1", versionNumber: 1, html: "<article id=\"legacy-source\"><h1>E2E legacy document</h1><p>Raw HTML stays on the legacy review surface.</p></article>", status: "Draft", createdAt: NOW }],
    comments: [], verdicts: [], capabilities: [],
  };
}

function fixture(): PersistedSnapshot {
  const accounts = [
    account(IDS.owner, "owner"), account(IDS.collaborator, "collaborator"),
    account(IDS.commenter, "commenter"), account(IDS.viewer, "viewer"),
  ];
  const roomMemberships = [
    [IDS.semanticRoom, IDS.owner, "owner"], [IDS.semanticRoom, IDS.collaborator, "collaborator"],
    [IDS.semanticRoom, IDS.commenter, "commenter"], [IDS.semanticRoom, IDS.viewer, "viewer"],
    [IDS.legacyRoom, IDS.owner, "owner"], [IDS.legacyRoom, IDS.collaborator, "collaborator"],
    [IDS.legacyRoom, IDS.commenter, "commenter"], [IDS.legacyRoom, IDS.viewer, "viewer"],
  ].map(([documentId, accountId, role]) => ({ documentId, accountId, role: role as "viewer" | "commenter" | "collaborator" | "owner", createdAt: NOW }));
  return {
    accounts,
    workspaces: [{ id: IDS.workspace, name: "Phase 9 E2E workspace", ownerAccountId: IDS.owner, createdAt: NOW, updatedAt: NOW }],
    workspaceMemberships: [
      { workspaceId: IDS.workspace, accountId: IDS.owner, role: "owner", createdAt: NOW },
      { workspaceId: IDS.workspace, accountId: IDS.collaborator, role: "member", createdAt: NOW },
      { workspaceId: IDS.workspace, accountId: IDS.commenter, role: "member", createdAt: NOW },
      { workspaceId: IDS.workspace, accountId: IDS.viewer, role: "member", createdAt: NOW },
    ],
    roomMemberships, documents: [semanticState(), legacyState()], roomInvitations: [], documentMetadata: [], auditEvents: [], agentRuns: [],
  };
}

async function main(): Promise<void> {
  const filePath = await assertE2eEnvironment();
  const repository = new JsonPersistenceRepository({ filePath, nodeEnv: process.env.NODE_ENV, concurrency: "single-process" });
  const snapshot = fixture();
  await repository.seed(snapshot);
  const checksum = createHash("sha256").update(JSON.stringify(await repository.inspectSnapshot())).digest("hex");
  const manifest = {
    kind: "phase9-e2e-seed", seededAt: new Date().toISOString(), databasePath: filePath,
    checksum, accounts: ["owner", "collaborator", "commenter", "viewer"],
    rooms: [{ id: IDS.semanticRoom, kind: "decision_room" }, { id: IDS.legacyRoom, kind: "legacy" }],
    passwordHint: "phase9-e2e-password",
  };
  const outputDir = path.resolve(process.env.E2E_OUTPUT_DIR!);
  const manifestPath = process.env.E2E_MANIFEST_PATH && path.isAbsolute(process.env.E2E_MANIFEST_PATH)
    ? path.resolve(process.env.E2E_MANIFEST_PATH) : path.join(outputDir, "phase9-e2e-manifest.json");
  if (!manifestPath.startsWith(`${outputDir}${path.sep}`)) throw new Error("Refusing E2E seed: manifest must be under E2E_OUTPUT_DIR");
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ seeded: true, manifestPath, checksum })}\n`);
}

void main();
