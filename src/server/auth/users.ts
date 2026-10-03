import crypto from "node:crypto";
import { getDb } from "../db";
import { badRequest, HttpError, newId, nowIso, sha256 } from "../util";
import { hashPassword, PASSWORD_MIN_LENGTH, verifyPassword } from "./password";

export interface User {
  id: string;
  email: string;
  name: string;
}

interface UserRow extends User {
  password_hash: string;
}

export const SESSION_COOKIE = "lf_session";
const SESSION_DAYS = 30;

export function hasAnyUser(): boolean {
  return getDb().prepare("SELECT 1 FROM users LIMIT 1").get() !== undefined;
}

export function createFirstUser(input: { email: string; name: string; password: string }): User {
  const db = getDb();
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    throw badRequest(`Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`);
  }
  return db.transaction(() => {
    if (hasAnyUser()) throw new HttpError(409, "already_setup", "Le compte existe déjà.");
    const now = nowIso();
    const user: User = { id: newId(), email: input.email.trim(), name: input.name.trim() };
    db.prepare(
      "INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(user.id, user.email, user.name, hashPassword(input.password), now, now);
    return user;
  })();
}

export function verifyCredentials(email: string, password: string): User | null {
  const row = getDb().prepare("SELECT * FROM users WHERE email = ?").get(email.trim()) as UserRow | undefined;
  if (!row) {
    // Same cost whether or not the account exists.
    hashPassword(password);
    return null;
  }
  if (!verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, email: row.email, name: row.name };
}

export function getUser(id: string): User | null {
  const row = getDb().prepare("SELECT id, email, name FROM users WHERE id = ?").get(id) as User | undefined;
  return row ?? null;
}

export function updateProfile(id: string, input: { name?: string; email?: string }): User {
  const db = getDb();
  const user = getUser(id);
  if (!user) throw badRequest("Compte introuvable.");
  const next = { name: input.name?.trim() || user.name, email: input.email?.trim() || user.email };
  db.prepare("UPDATE users SET name = ?, email = ?, updated_at = ? WHERE id = ?").run(next.name, next.email, nowIso(), id);
  return { id, ...next };
}

export function changePassword(id: string, current: string, next: string): void {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  if (!row || !verifyPassword(current, row.password_hash)) throw badRequest("Mot de passe actuel incorrect.");
  if (next.length < PASSWORD_MIN_LENGTH) {
    throw badRequest(`Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`);
  }
  getDb().prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hashPassword(next), nowIso(), id);
}

// --- sessions ---------------------------------------------------------------------------

export function createSession(userId: string, userAgent: string | null): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  getDb()
    .prepare("INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)")
    .run(sha256(token), userId, now.toISOString(), expiresAt.toISOString(), now.toISOString(), userAgent?.slice(0, 200) ?? null);
  return { token, expiresAt };
}

/** Returns the session's user, sliding the expiry at most once a day. */
export function userFromSession(token: string | undefined): User | null {
  if (!token) return null;
  const db = getDb();
  const id = sha256(token);
  const row = db
    .prepare(
      "SELECT s.expires_at, s.last_seen_at, u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
    )
    .get(id) as (User & { expires_at: string; last_seen_at: string }) | undefined;
  if (!row) return null;
  const now = Date.now();
  if (Date.parse(row.expires_at) < now) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return null;
  }
  if (now - Date.parse(row.last_seen_at) > 86_400_000) {
    db.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?").run(
      new Date(now).toISOString(),
      new Date(now + SESSION_DAYS * 86_400_000).toISOString(),
      id,
    );
  }
  return { id: row.id, email: row.email, name: row.name };
}

export function deleteSession(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sha256(token));
}

export function deleteOtherSessions(userId: string, keepToken: string | undefined): number {
  const keep = keepToken ? sha256(keepToken) : "";
  return getDb().prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(userId, keep).changes;
}

export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 86_400;
