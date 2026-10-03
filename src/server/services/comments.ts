import { z } from "zod";
import type { Comment } from "@/lib/types";
import { getDb } from "../db";
import { publish } from "../events";
import type { Actor } from "../http";
import { badRequest, notFound, nowIso, newId } from "../util";

// Exchanges between the human and the agents (F1.7). A root comment addressed to someone is
// a request; it stays open until resolved. Replies hang under their root.

export const createCommentSchema = z
  .object({
    body: z.string().trim().min(1).max(10_000),
    spreadId: z.string().max(40).nullable().optional(),
    parentId: z.string().max(40).optional(),
    addressedTo: z.enum(["human", "agent"]).nullable().optional(),
  })
  .strict();

interface CommentRow {
  id: string;
  book_id: string;
  spread_id: string | null;
  parent_id: string | null;
  author_type: "human" | "agent";
  author_name: string;
  body: string;
  addressed_to: "human" | "agent" | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

function toComment(r: CommentRow): Comment {
  return {
    id: r.id,
    bookId: r.book_id,
    spreadId: r.spread_id,
    parentId: r.parent_id,
    author: { type: r.author_type, name: r.author_name },
    body: r.body,
    addressedTo: r.addressed_to,
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolved_by,
    createdAt: r.created_at,
  };
}

function getRow(id: string): CommentRow {
  const row = getDb().prepare("SELECT * FROM comments WHERE id = ?").get(id) as CommentRow | undefined;
  if (!row) throw notFound("Message");
  return row;
}

export function listComments(bookId: string, opts: { spreadId?: string; openOnly?: boolean } = {}): Comment[] {
  const rows = getDb().prepare("SELECT * FROM comments WHERE book_id = ? ORDER BY created_at, rowid").all(bookId) as CommentRow[];
  let roots = rows.filter((r) => !r.parent_id);
  if (opts.spreadId) roots = roots.filter((r) => r.spread_id === opts.spreadId);
  if (opts.openOnly) roots = roots.filter((r) => !r.resolved_at);
  const keep = new Set(roots.map((r) => r.id));
  return rows.filter((r) => keep.has(r.id) || (r.parent_id && keep.has(r.parent_id))).map(toComment);
}

export function createComment(bookId: string, input: z.infer<typeof createCommentSchema>, actor: Actor): Comment {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM books WHERE id = ?").get(bookId)) throw notFound("Livre");
  let spreadId = input.spreadId ?? null;
  let addressedTo = input.addressedTo ?? null;
  if (input.parentId) {
    const parent = getRow(input.parentId);
    if (parent.book_id !== bookId) throw badRequest("Ce message n'appartient pas à ce livre.");
    if (parent.parent_id) throw badRequest("Répondre au premier message du fil.");
    spreadId = parent.spread_id;
    addressedTo = null;
    // Answering a request re-opens nothing; a reply from the other side keeps the thread open.
  } else if (spreadId && !db.prepare("SELECT 1 FROM spreads WHERE id = ? AND book_id = ?").get(spreadId, bookId)) {
    throw notFound("Double page");
  }
  const row: CommentRow = {
    id: newId(),
    book_id: bookId,
    spread_id: spreadId,
    parent_id: input.parentId ?? null,
    author_type: actor.type,
    author_name: actor.name,
    body: input.body,
    addressed_to: addressedTo,
    resolved_at: null,
    resolved_by: null,
    created_at: nowIso(),
  };
  db.prepare(
    `INSERT INTO comments (id, book_id, spread_id, parent_id, author_type, author_name, body, addressed_to, resolved_at, resolved_by, created_at)
     VALUES (@id, @book_id, @spread_id, @parent_id, @author_type, @author_name, @body, @addressed_to, @resolved_at, @resolved_by, @created_at)`,
  ).run(row);
  publish("comments", bookId, actor, spreadId ?? undefined);
  return toComment(row);
}

export function setCommentResolved(commentId: string, resolved: boolean, actor: Actor): Comment {
  const row = getRow(commentId);
  const rootId = row.parent_id ?? row.id;
  getDb()
    .prepare("UPDATE comments SET resolved_at = ?, resolved_by = ? WHERE id = ?")
    .run(resolved ? nowIso() : null, resolved ? actor.name : null, rootId);
  publish("comments", row.book_id, actor, row.spread_id ?? undefined);
  return toComment(getRow(rootId));
}

export function deleteComment(commentId: string, actor: Actor): void {
  const row = getRow(commentId);
  getDb().prepare("DELETE FROM comments WHERE id = ?").run(commentId);
  publish("comments", row.book_id, actor, row.spread_id ?? undefined);
}

export function commentBookId(commentId: string): string {
  return getRow(commentId).book_id;
}

/** Open requests addressed to `to`, across books: the agent's inbox. */
export function listOpenRequests(to: "agent" | "human", bookId?: string): (Comment & { bookTitle: string; replies: Comment[] })[] {
  const db = getDb();
  const roots = (
    bookId
      ? db
          .prepare(
            "SELECT c.*, b.title AS book_title FROM comments c JOIN books b ON b.id = c.book_id WHERE c.parent_id IS NULL AND c.resolved_at IS NULL AND c.addressed_to = ? AND c.book_id = ? ORDER BY c.created_at",
          )
          .all(to, bookId)
      : db
          .prepare(
            "SELECT c.*, b.title AS book_title FROM comments c JOIN books b ON b.id = c.book_id WHERE c.parent_id IS NULL AND c.resolved_at IS NULL AND c.addressed_to = ? AND b.archived_at IS NULL ORDER BY c.created_at",
          )
          .all(to)
  ) as (CommentRow & { book_title: string })[];
  const replies = db.prepare("SELECT * FROM comments WHERE parent_id = ? ORDER BY created_at, rowid");
  return roots.map((r) => ({
    ...toComment(r),
    bookTitle: r.book_title,
    replies: (replies.all(r.id) as CommentRow[]).map(toComment),
  }));
}
