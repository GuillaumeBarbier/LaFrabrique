import type { ActivityDetail, ActivityEntry } from "@/lib/types";
import { getDb } from "../db";
import type { Actor } from "../http";
import { newId, nowIso } from "../util";

// History (F1.8): every change is attributed; edits by the same author on the same target
// within COALESCE_MS are grouped, keeping the state from *before* the first one.

export const COALESCE_MS = 5 * 60_000;

export type ActivityAction =
  | "book.create"
  | "book.update"
  | "spread.create"
  | "spread.update"
  | "spread.delete"
  | "spread.reorder"
  | "character.create"
  | "character.update"
  | "character.delete"
  | "series.create"
  | "series.update"
  | "restore";

const RESTORABLE = new Set<string>([
  "book.update",
  "spread.update",
  "spread.delete",
  "spread.reorder",
  "character.update",
  "character.delete",
  "series.update",
]);

export interface ActivityRow {
  id: string;
  book_id: string | null;
  series_id: string | null;
  spread_id: string | null;
  character_id: string | null;
  actor_type: "human" | "agent";
  actor_name: string;
  action: string;
  summary: string;
  snapshot: string | null;
  details: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordInput {
  /** A book, or a series (characters and settings shared by its books). */
  bookId: string | null;
  seriesId?: string | null;
  spreadId?: string | null;
  characterId?: string | null;
  actor: Actor;
  action: ActivityAction;
  labels: string[];
  snapshot?: unknown;
  /** Which image, which target: shown in list_activity. */
  details?: ActivityDetail[];
  coalesce?: boolean;
}

function parseDetails(json: string | null): ActivityDetail[] {
  if (!json) return [];
  try {
    const value = JSON.parse(json) as unknown;
    return Array.isArray(value) ? (value as ActivityDetail[]) : [];
  } catch {
    return [];
  }
}

export function recordActivity(input: RecordInput): void {
  const db = getDb();
  const now = nowIso();
  const spreadId = input.spreadId ?? null;
  const characterId = input.characterId ?? null;
  const seriesId = input.bookId ? null : (input.seriesId ?? null);
  if (input.coalesce) {
    const last = db
      .prepare(
        "SELECT * FROM activity WHERE book_id IS ? AND series_id IS ? AND spread_id IS ? AND character_id IS ? ORDER BY updated_at DESC, rowid DESC LIMIT 1",
      )
      .get(input.bookId, seriesId, spreadId, characterId) as ActivityRow | undefined;
    if (
      last &&
      last.action === input.action &&
      last.actor_type === input.actor.type &&
      last.actor_name === input.actor.name &&
      Date.now() - Date.parse(last.updated_at) < COALESCE_MS
    ) {
      const labels = [...new Set([...last.summary.split(", "), ...input.labels])];
      const details = [...parseDetails(last.details), ...(input.details ?? [])].slice(-200);
      db.prepare("UPDATE activity SET summary = ?, details = ?, updated_at = ? WHERE id = ?").run(
        labels.join(", "),
        details.length > 0 ? JSON.stringify(details) : null,
        now,
        last.id,
      );
      return;
    }
  }
  db.prepare(
    `INSERT INTO activity (id, book_id, series_id, spread_id, character_id, actor_type, actor_name, action, summary, snapshot, details, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    input.bookId,
    seriesId,
    spreadId,
    characterId,
    input.actor.type,
    input.actor.name,
    input.action,
    input.labels.join(", "),
    input.snapshot === undefined ? null : JSON.stringify(input.snapshot),
    input.details?.length ? JSON.stringify(input.details) : null,
    now,
    now,
  );
}

function toEntry(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    bookId: row.book_id,
    seriesId: row.series_id,
    spreadId: row.spread_id,
    characterId: row.character_id,
    actor: { type: row.actor_type, name: row.actor_name },
    action: row.action,
    summary: row.summary,
    details: parseDetails(row.details),
    restorable: RESTORABLE.has(row.action) && row.snapshot !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * History of a book, with the changes made to its series (shared characters, style, rules),
 * or of a series alone.
 */
export function listActivity(
  owner: { bookId: string } | { seriesId: string },
  opts: { spreadId?: string; characterId?: string; limit?: number } = {},
): ActivityEntry[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const where: string[] = [];
  const params: (string | number)[] = [];
  if ("bookId" in owner) {
    const seriesId = (getDb().prepare("SELECT series_id FROM books WHERE id = ?").get(owner.bookId) as { series_id: string | null } | undefined)
      ?.series_id;
    where.push(seriesId ? "(book_id = ? OR (book_id IS NULL AND series_id = ?))" : "book_id = ?");
    params.push(owner.bookId, ...(seriesId ? [seriesId] : []));
  } else {
    where.push("book_id IS NULL AND series_id = ?");
    params.push(owner.seriesId);
  }
  if (opts.spreadId) {
    where.push("spread_id = ?");
    params.push(opts.spreadId);
  }
  if (opts.characterId) {
    where.push("character_id = ?");
    params.push(opts.characterId);
  }
  const rows = getDb()
    .prepare(`SELECT * FROM activity WHERE ${where.join(" AND ")} ORDER BY updated_at DESC, rowid DESC LIMIT ?`)
    .all(...params, limit) as ActivityRow[];
  return rows.map(toEntry);
}

export function getActivityRow(id: string): ActivityRow | undefined {
  return getDb().prepare("SELECT * FROM activity WHERE id = ?").get(id) as ActivityRow | undefined;
}
