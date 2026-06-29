import { Pool } from "pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export function hashPassword(password: string): string {
  return crypto.pbkdf2Sync(password, "viscollab-salt", 1000, 64, "sha512").toString("hex");
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

export async function createUser(username: string, passwordHash: string, role: string, token: string): Promise<any> {
  const users = await getUsers();
  const newUser = { username, passwordHash, role, token };
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
    const init = { state: null, users: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2), "utf-8");
    return init;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return { state: null, users: [] };
  }
}

async function writeJsonDb(data: any) {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}
