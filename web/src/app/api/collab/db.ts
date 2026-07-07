import { Pool } from "pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Strong password hashing using Node's built-in scrypt (no external deps).
// Each user gets a unique random salt stored alongside the hash.
const SCRYPT_KEYLEN = 64;

/**
 * Generates a fresh random per-user salt (hex-encoded).
 */
export function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Derives a password hash (hex) from a password and a per-user salt (hex).
 * scrypt is deliberately slow/memory-hard to resist offline cracking.
 */
export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
}

/**
 * Convenience: create a brand-new salt+hash pair for a password.
 */
export function hashPasswordWithSalt(password: string): { salt: string; hash: string } {
  const salt = generateSalt();
  return { salt, hash: hashPassword(password, salt) };
}

/**
 * Constant-time verification of a password against a stored salt + hash.
 * Returns false if the stored record is missing/malformed.
 */
export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  if (!salt || !expectedHash) return false;
  let expectedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expectedHash, "hex");
  } catch {
    return false;
  }
  // A malformed stored hash of the wrong length can't match; bail before
  // timingSafeEqual (which throws on length mismatch).
  if (expectedBuf.length !== SCRYPT_KEYLEN) return false;
  const actualBuf = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "db.json");

let pool: Pool | null = null;
let tableInitializedPromise: Promise<void> | null = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
}

function ensureTable(): Promise<void> {
  if (!pool) return Promise.resolve();
  if (!tableInitializedPromise) {
    tableInitializedPromise = (async () => {
      await pool!.query(`
        CREATE TABLE IF NOT EXISTS collab_state (
          key VARCHAR(255) PRIMARY KEY,
          value JSONB
        )
      `);
    })();
  }
  return tableInitializedPromise;
}

export async function getState(documentId?: string): Promise<any> {
  const key = documentId ? `doc_${documentId}` : "state";
  if (pool) {
    await ensureTable();
    const res = await pool.query("SELECT value FROM collab_state WHERE key = $1", [key]);
    if (res.rows.length > 0) {
      return res.rows[0].value;
    }
    return null;
  } else {
    const data = await readJsonDb();
    return data[key] ?? null;
  }
}

export async function saveState(state: any, documentId?: string): Promise<void> {
  const key = documentId ? `doc_${documentId}` : "state";
  if (pool) {
    await ensureTable();
    await pool.query(
      `INSERT INTO collab_state (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(state)]
    );
  } else {
    const data = await readJsonDb();
    data[key] = state;
    await writeJsonDb(data);
  }
}

export async function getDocuments(): Promise<any[]> {
  if (pool) {
    await ensureTable();
    const res = await pool.query("SELECT value FROM collab_state WHERE key = 'documents'");
    if (res.rows.length > 0) {
      return res.rows[0].value || [];
    }
    return [];
  } else {
    const data = await readJsonDb();
    return data.documents ?? [];
  }
}

export async function saveDocuments(docs: any[]): Promise<void> {
  if (pool) {
    await ensureTable();
    await pool.query(
      `INSERT INTO collab_state (key, value) VALUES ('documents', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(docs)]
    );
  } else {
    const data = await readJsonDb();
    data.documents = docs;
    await writeJsonDb(data);
  }
}

export async function getUsers(): Promise<any[]> {
  if (pool) {
    await ensureTable();
    const res = await pool.query("SELECT value FROM collab_state WHERE key = 'users'");
    if (res.rows.length > 0) {
      return res.rows[0].value || [];
    }
    return [];
  } else {
    const data = await readJsonDb();
    return data.users ?? [];
  }
}

export async function saveUsers(users: any[]): Promise<void> {
  if (pool) {
    await ensureTable();
    await pool.query(
      `INSERT INTO collab_state (key, value) VALUES ('users', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(users)]
    );
  } else {
    const data = await readJsonDb();
    data.users = users;
    await writeJsonDb(data);
  }
}

export async function getUserByUsername(username: string): Promise<any> {
  const users = await getUsers();
  return users.find((u: any) => u.username?.toLowerCase() === username.toLowerCase()) || null;
}

export async function createUser(username: string, passwordSalt: string, passwordHash: string, role: string, token: string): Promise<any> {
  const users = await getUsers();
  const newUser = { username, passwordSalt, passwordHash, role, token };
  users.push(newUser);
  await saveUsers(users);
  return newUser;
}

export async function updateUserRole(username: string, role: string): Promise<void> {
  const users = await getUsers();
  const userIndex = users.findIndex((u: any) => u.username?.toLowerCase() === username.toLowerCase());
  if (userIndex !== -1) {
    users[userIndex].role = role;
    await saveUsers(users);
  }
}

async function readJsonDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const init = { state: null, users: [], workspaces: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2), "utf-8");
    return init;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return { state: null, users: [], workspaces: [] };
  }
}

async function writeJsonDb(data: any) {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export async function getDocumentRole(documentId: string, username: string): Promise<string | null> {
  const docs = await getDocuments();
  const doc = docs.find((d: any) => d.id === documentId);
  if (!doc || !doc.members) return null;
  const member = doc.members.find((m: any) => m.username?.toLowerCase() === username.toLowerCase());
  return member ? member.role : null;
}

export async function getWorkspaces(): Promise<any[]> {
  if (pool) {
    await ensureTable();
    const res = await pool.query("SELECT value FROM collab_state WHERE key = 'workspaces'");
    if (res.rows.length > 0) {
      return res.rows[0].value || [];
    }
    return [];
  } else {
    const data = await readJsonDb();
    return data.workspaces ?? [];
  }
}

export async function saveWorkspaces(workspaces: any[]): Promise<void> {
  if (pool) {
    await ensureTable();
    await pool.query(
      `INSERT INTO collab_state (key, value) VALUES ('workspaces', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(workspaces)]
    );
  } else {
    const data = await readJsonDb();
    data.workspaces = workspaces;
    await writeJsonDb(data);
  }
}

export async function createWorkspace(id: string, name: string, ownerUsername: string): Promise<any> {
  const workspaces = await getWorkspaces();
  const newWorkspace = {
    id,
    name,
    createdBy: ownerUsername,
    members: [{ username: ownerUsername, role: 'owner' }]
  };
  workspaces.push(newWorkspace);
  await saveWorkspaces(workspaces);
  return newWorkspace;
}
