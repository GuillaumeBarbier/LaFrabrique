import crypto from "node:crypto";
import { z } from "zod";
import type { AssetRef, Book, Share, SharedBook } from "@/lib/types";
import { CUSTOM_FONT_PREFIX, customFontCssFamily, isCustomFontKey } from "@/lib/fonts";
import { getDb } from "../db";
import { publish } from "../events";
import type { Actor } from "../http";
import { newId, notFound, nowIso } from "../util";
import { recordActivity } from "./activity";
import { getBook } from "./books";
import { listCustomFonts } from "./fonts";

// Reading links (ADR-0009): a book in the viewer for someone without an account. The link
// carries a random token; it opens that book read-only — cover and pages, nothing of the
// workshop (brief, notes, characters, history) — until it expires or is revoked.

export const createShareSchema = z
  .object({
    /** Who it is for, to recognise the link later. */
    label: z.string().trim().max(80).optional(),
    /** Validity in days; omitted or null = until revoked. */
    expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  })
  .strict();

interface ShareRow {
  id: string;
  book_id: string;
  token: string;
  label: string;
  created_at: string;
  created_by_type: "human" | "agent";
  created_by_name: string;
  expires_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
}

export function shareUrl(origin: string, token: string): string {
  return `${origin}/lire/${token}`;
}

function expired(row: Pick<ShareRow, "expires_at">, now = Date.now()): boolean {
  return row.expires_at !== null && Date.parse(row.expires_at) <= now;
}

function toShare(row: ShareRow, origin: string | null): Share {
  return {
    id: row.id,
    bookId: row.book_id,
    label: row.label,
    ...(origin ? { url: shareUrl(origin, row.token) } : {}),
    createdAt: row.created_at,
    createdBy: { type: row.created_by_type, name: row.created_by_name },
    expiresAt: row.expires_at,
    expired: expired(row),
    lastViewedAt: row.last_viewed_at,
    viewCount: row.view_count,
  };
}

/** The book's links, newest first. `origin` null: without the links themselves (agents). */
export function listShares(bookId: string, origin: string | null): Share[] {
  if (!getDb().prepare("SELECT 1 FROM books WHERE id = ?").get(bookId)) throw notFound("Livre");
  const rows = getDb().prepare("SELECT * FROM shares WHERE book_id = ? ORDER BY created_at DESC").all(bookId) as ShareRow[];
  return rows.map((r) => toShare(r, origin));
}

export function createShare(bookId: string, input: z.infer<typeof createShareSchema>, actor: Actor, origin: string): Share {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM books WHERE id = ?").get(bookId)) throw notFound("Livre");
  const now = Date.now();
  const row: ShareRow = {
    id: newId(),
    book_id: bookId,
    // 192 bits: unguessable, short enough to send in a message.
    token: crypto.randomBytes(24).toString("base64url"),
    label: input.label ?? "",
    created_at: new Date(now).toISOString(),
    created_by_type: actor.type,
    created_by_name: actor.name,
    expires_at: input.expiresInDays ? new Date(now + input.expiresInDays * 86_400_000).toISOString() : null,
    last_viewed_at: null,
    view_count: 0,
  };
  db.transaction(() => {
    db.prepare(
      `INSERT INTO shares (id, book_id, token, label, created_at, created_by_type, created_by_name, expires_at, last_viewed_at, view_count)
       VALUES (@id, @book_id, @token, @label, @created_at, @created_by_type, @created_by_name, @expires_at, @last_viewed_at, @view_count)`,
    ).run(row);
    recordActivity({ bookId, actor, action: "share.create", labels: [`lien de lecture créé${row.label ? ` (${row.label})` : ""}`] });
  })();
  publish("activity", bookId, actor);
  return toShare(row, origin);
}

/** Ends a link at once: it is deleted, the history keeps a trace. */
export function revokeShare(id: string, actor: Actor): void {
  const db = getDb();
  const row = db.prepare("SELECT * FROM shares WHERE id = ?").get(id) as ShareRow | undefined;
  if (!row) throw notFound("Lien");
  db.transaction(() => {
    db.prepare("DELETE FROM shares WHERE id = ?").run(id);
    recordActivity({ bookId: row.book_id, actor, action: "share.revoke", labels: [`lien de lecture révoqué${row.label ? ` (${row.label})` : ""}`] });
  })();
  publish("activity", row.book_id, actor);
}

export function bookIdOfShare(id: string): string {
  const row = getDb().prepare("SELECT book_id FROM shares WHERE id = ?").get(id) as { book_id: string } | undefined;
  if (!row) throw notFound("Lien");
  return row.book_id;
}

// ---------------------------------------------------------------------------------------
// Visitor side (no account)
// ---------------------------------------------------------------------------------------

/** The live link for a token, or null (unknown, revoked, expired). */
function activeShare(token: string): ShareRow | null {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const row = getDb().prepare("SELECT * FROM shares WHERE token = ?").get(token) as ShareRow | undefined;
  return row && !expired(row) ? row : null;
}

export function recordView(token: string): void {
  getDb().prepare("UPDATE shares SET view_count = view_count + 1, last_viewed_at = ? WHERE token = ?").run(nowIso(), token);
}

/** Assets a visitor may load: the cover and the illustrations, screen sizes only. */
export const SHARED_SIZES = ["web", "thumb"] as const;

function sharedAsset(token: string, ref: AssetRef | null): AssetRef | null {
  if (!ref) return null;
  const base = `/api/share/${token}/assets/${ref.id}`;
  // No original for visitors: the print-quality file stays in the workshop.
  return { id: ref.id, width: ref.width, height: ref.height, url: `${base}?size=web`, printUrl: `${base}?size=web`, webUrl: `${base}?size=web`, thumbUrl: `${base}?size=thumb` };
}

function toSharedBook(token: string, book: Book): SharedBook {
  return {
    title: book.title,
    subtitle: book.subtitle,
    author: book.author,
    illustrator: book.illustrator,
    language: book.language,
    format: book.format,
    typography: book.typography,
    cover: sharedAsset(token, book.cover),
    spreads: book.spreads.map((s) => ({
      id: s.id,
      text: s.text,
      illustration: sharedAsset(token, s.illustration),
      // The illustration brief is a working note: not even as alt text.
      illustrationBrief: "",
      illustrationFit: s.illustrationFit,
      pageColor: s.pageColor,
      textSizePt: s.textSizePt,
      textAlign: s.textAlign,
      textValign: s.textValign,
    })),
  };
}

/** What the viewer page shows for a token, or null. */
export function sharedBook(token: string): { book: SharedBook; customFontIds: string[] } | null {
  const row = activeShare(token);
  if (!row) return null;
  const book = getBook(row.book_id);
  const customFontIds = [book.typography.titleFont, book.typography.bodyFont]
    .filter(isCustomFontKey)
    .map((k) => k.slice(CUSTOM_FONT_PREFIX.length));
  return { book: toSharedBook(token, book), customFontIds: [...new Set(customFontIds)] };
}

/** Whether a visitor with this token may load this asset (cover, illustration, or a font the book uses). */
export function sharedAssetAllowed(token: string, assetId: string): boolean {
  const row = activeShare(token);
  if (!row) return false;
  const db = getDb();
  return !!(
    db.prepare("SELECT 1 FROM books WHERE id = ? AND cover_asset_id = ?").get(row.book_id, assetId) ??
    db.prepare("SELECT 1 FROM spreads WHERE book_id = ? AND illustration_asset_id = ?").get(row.book_id, assetId)
  );
}

export function sharedFontAllowed(token: string, fontId: string): boolean {
  return sharedBook(token)?.customFontIds.includes(fontId) ?? false;
}

/** @font-face rules for the uploaded fonts a shared book uses, served through its link. */
export function sharedFontsCss(token: string, fontIds: string[]): string {
  return listCustomFonts()
    .filter((f) => fontIds.includes(f.id))
    .map((f) => `@font-face { font-family: "${customFontCssFamily(f.id)}"; src: url("/api/share/${token}/fonts/${f.id}") format("${f.format}"); font-display: swap; }`)
    .join("\n");
}
