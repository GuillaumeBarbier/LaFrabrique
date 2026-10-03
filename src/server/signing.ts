import crypto from "node:crypto";
import { getDb } from "./db";

// Temporary links to an asset, readable without a key (ADR-0006): an image generator called by
// an agent (OpenAI, Google, fal…) must be able to download a character's reference itself.
// HMAC of (asset, size, expiry) with a secret kept in the database; nothing else is exposed.

export const SIGNED_TTL_SECONDS = 24 * 3600;

function secret(): Buffer {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'signing_secret'").get() as { value: string } | undefined;
  if (row) return Buffer.from(row.value, "hex");
  const value = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('signing_secret', ?)").run(value);
  return Buffer.from((db.prepare("SELECT value FROM settings WHERE key = 'signing_secret'").get() as { value: string }).value, "hex");
}

function mac(assetId: string, size: string, exp: number): string {
  return crypto.createHmac("sha256", secret()).update(`${assetId}:${size}:${exp}`).digest("base64url").slice(0, 32);
}

export function signAsset(assetId: string, size: string, ttlSeconds = SIGNED_TTL_SECONDS, now = Date.now()): { exp: number; sig: string } {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return { exp, sig: mac(assetId, size, exp) };
}

export function verifyAssetSignature(assetId: string, size: string, exp: number, sig: string, now = Date.now()): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = Buffer.from(mac(assetId, size, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export function signedAssetUrl(origin: string, assetId: string, size: "print" | "web" | "thumb", ttlSeconds = SIGNED_TTL_SECONDS): string {
  const { exp, sig } = signAsset(assetId, size, ttlSeconds);
  return `${origin}/api/v1/assets/${assetId}?size=${size}&exp=${exp}&sig=${sig}`;
}
