import type { ActivityEntry } from "@/lib/types";
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
  | "restore";

const RESTORABLE = new Set<string>([
  "book.update",
  "spread.update",
  "spread.delete",
  "spread.reorder",
  "character.update",
  "character.delete",
]);

interface ActivityRow {
  id: string;
  book_id: string;
  spread_id: string | null;
  character_id: string | null;
  actor_type: "human" | "agent";
  actor_name: string;
  action: string;
  summary: string;
  snapshot: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordInput {
  bookId: string;
  spreadId?: string | null;
  characterId?: string | null;
  actor: Actor;
  action: ActivityAction;
  labels: string[];
  snapshot?: unknown;
  coalesce?: boolean;
}

export function recordActivity(input: RecordInput): void {
  const db = getDb();
  const now = nowIso();
  const spreadId = input.spreadId ?? null;
  const characterId = input.characterId ?? null;
  if (input.coalesce) {
    const last = db
      .prepare(
        "SELECT * FROM activity WHERE book_id = ? AND spread_id IS ? AND character_id IS ? ORDER BY updated_at DESC, rowid DESC LIMIT 1",
      )
      .get(input.bookId, spreadId, characterId) as ActivityRow | undefined;
    if (
      last &&
      last.action === input.action &&
      last.actor_type === input.actor.type &&
      last.actor_name === input.actor.name &&
      Date.now() - Date.parse(last.updated_at) < COALESCE_MS
    ) {
      const labels = [...new Set([...last.summary.split(", "), ...input.labels])];
      db.prepare("UPDATE activity SET summary = ?, updated_at = ? WHERE id = ?").run(labels.join(", "), now, last.id);
      return;
    }
  }
  db.prepare(
    `INSERT INTO activity (id, book_id, spread_id, character_id, actor_type, actor_name, action, summary, snapshot, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    input.bookId,
    spreadId,
    characterId,
    input.actor.type,
    input.actor.name,
    input.action,
    input.labels.join(", "),
    input.snapshot === undefined ? null : JSON.stringify(input.snapshot),
    now,
    now,
  );
}

function toEntry(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    bookId: row.book_id,
    spreadId: row.spread_id,
    characterId: row.character_id,
    actor: { type: row.actor_type, name: row.actor_name },
    action: row.action,
    summary: row.summary,
    restorable: RESTORABLE.has(row.action) && row.snapshot !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listActivity(bookId: string, opts: { spreadId?: string; limit?: number } = {}): ActivityEntry[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const rows = (
    opts.spreadId
      ? getDb()
          .prepare("SELECT * FROM activity WHERE book_id = ? AND spread_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT ?")
          .all(bookId, opts.spreadId, limit)
      : getDb().prepare("SELECT * FROM activity WHERE book_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT ?").all(bookId, limit)
  ) as ActivityRow[];
  return rows.map(toEntry);
}

export function getActivityRow(id: string): ActivityRow | undefined {
  return getDb().prepare("SELECT * FROM activity WHERE id = ?").get(id) as ActivityRow | undefined;
}
