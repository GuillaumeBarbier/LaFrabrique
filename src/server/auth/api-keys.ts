import crypto from "node:crypto";
import { getDb } from "../db";
import { newId, notFound, nowIso, sha256 } from "../util";

export type KeyScope = "read" | "write";

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  scope: KeyScope;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scope: KeyScope;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export const KEY_PREFIX = "lfab_";

function toInfo(row: ApiKeyRow): ApiKeyInfo {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scope: row.scope,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

/** Creates a key. The clear value is returned once and never stored (ADR-0002). */
export function createApiKey(name: string, scope: KeyScope): { key: string; info: ApiKeyInfo } {
  const secret = crypto.randomBytes(30).toString("base64url");
  const key = `${KEY_PREFIX}${secret}`;
  const row: ApiKeyRow = {
    id: newId(),
    name,
    prefix: key.slice(0, KEY_PREFIX.length + 6),
    scope,
    created_at: nowIso(),
    last_used_at: null,
    revoked_at: null,
  };
  getDb()
    .prepare(
      "INSERT INTO api_keys (id, name, prefix, key_hash, scope, created_at) VALUES (@id, @name, @prefix, @hash, @scope, @created_at)",
    )
    .run({ ...row, hash: sha256(key) });
  return { key, info: toInfo(row) };
}

export function listApiKeys(): ApiKeyInfo[] {
  const rows = getDb().prepare("SELECT * FROM api_keys ORDER BY revoked_at IS NOT NULL, created_at DESC").all() as ApiKeyRow[];
  return rows.map(toInfo);
}

export function revokeApiKey(id: string): void {
  const res = getDb().prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(nowIso(), id);
  if (res.changes === 0) throw notFound("Clé");
}

/** Resolves a bearer key to its active row; records the use at most once a minute. */
export function authenticateApiKey(key: string): ApiKeyInfo | null {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const db = getDb();
  const row = db.prepare("SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL").get(sha256(key)) as
    | ApiKeyRow
    | undefined;
  if (!row) return null;
  const now = new Date();
  if (!row.last_used_at || now.getTime() - Date.parse(row.last_used_at) > 60_000) {
    db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(now.toISOString(), row.id);
    row.last_used_at = now.toISOString();
  }
  return toInfo(row);
}
