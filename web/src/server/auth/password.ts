import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PREFIX = "scrypt-v1";
const KEY_LENGTH = 64;

/** A self-contained salted hash; salts never travel in a session or response. */
export function hashPassword(password: string): string {
  if (typeof password !== "string" || password.length < 12 || password.length > 512) {
    throw new Error("password must be between 12 and 512 characters");
  }
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${PREFIX}$${salt}$${digest}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [prefix, salt, expected] = typeof stored === "string" ? stored.split("$") : [];
  if (prefix !== PREFIX || !salt || !expected || !/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(expected)) return false;
  const actual = scryptSync(password, salt, KEY_LENGTH);
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}
