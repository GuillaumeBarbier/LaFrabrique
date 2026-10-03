import { z } from "zod";
import {
  BOOK_FORMATS,
  BOOK_STATUSES,
  DEFAULT_FORMAT,
  DEFAULT_TYPOGRAPHY,
  ILLUSTRATION_FITS,
  STATUS_LABELS,
  TEXT_ALIGNS,
  TEXT_VALIGNS,
  type Typography,
} from "@/lib/book";
import type { Book, BookSummary, Spread } from "@/lib/types";
import { deleteAssetFiles, type AssetRow } from "../assets";
import { getDb } from "../db";
import { publish } from "../events";
import type { Actor } from "../http";
import { badRequest, HttpError, newId, notFound, nowIso } from "../util";
import { getActivityRow, recordActivity } from "./activity";
import { fontKeyExists } from "./fonts";
import { assetUrls, type BookRow, loadAssetRefs, parseTypography, type SpreadRow, toSpread } from "./rows";

// ---------------------------------------------------------------------------------------
// Validation (shared by REST and MCP)
// ---------------------------------------------------------------------------------------

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur attendue au format #RRGGBB.");
const fontKey = z.string().min(1).max(80).refine(fontKeyExists, "Police inconnue (voir GET /api/v1/fonts).");
const age = z.number().int().min(0).max(18).nullable();

export const typographyPatchSchema = z
  .object({
    titleFont: fontKey,
    bodyFont: fontKey,
    titleSizePt: z.number().min(8).max(144),
    bodySizePt: z.number().min(6).max(96),
    lineHeight: z.number().min(0.8).max(3),
    textColor: hex,
    pageColor: hex,
    textAlign: z.enum(TEXT_ALIGNS),
    textValign: z.enum(TEXT_VALIGNS),
  })
  .partial()
  .strict();

const formatKey = z.enum(BOOK_FORMATS.map((f) => f.key) as [string, ...string[]]);

export const createBookSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    subtitle: z.string().max(200).optional(),
    author: z.string().max(160).optional(),
    illustrator: z.string().max(160).optional(),
    language: z.string().min(2).max(8).optional(),
    ageMin: age.optional(),
    ageMax: age.optional(),
    format: formatKey.optional(),
    brief: z.string().max(20_000).optional(),
    spreads: z.number().int().min(0).max(40).optional(),
  })
  .strict();

export const updateBookSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    subtitle: z.string().max(200),
    author: z.string().max(160),
    illustrator: z.string().max(160),
    language: z.string().min(2).max(8),
    ageMin: age,
    ageMax: age,
    status: z.enum(BOOK_STATUSES),
    format: formatKey,
    brief: z.string().max(20_000),
    wordsPerSpread: z.number().int().min(1).max(1000).nullable(),
    typography: typographyPatchSchema,
    archived: z.boolean(),
  })
  .partial()
  .strict();

export const createSpreadSchema = z
  .object({
    position: z.number().int().min(0).optional(),
    text: z.string().max(10_000).optional(),
    illustrationBrief: z.string().max(5_000).optional(),
    notes: z.string().max(5_000).optional(),
  })
  .strict();

export const updateSpreadSchema = z
  .object({
    text: z.string().max(10_000),
    illustrationBrief: z.string().max(5_000),
    illustrationFit: z.enum(ILLUSTRATION_FITS),
    notes: z.string().max(5_000),
    textAlign: z.enum(TEXT_ALIGNS).nullable(),
    textValign: z.enum(TEXT_VALIGNS).nullable(),
    textSizePt: z.number().min(6).max(96).nullable(),
    pageColor: hex.nullable(),
    /** Optimistic concurrency: the version the writer last saw. */
    baseVersion: z.number().int().optional(),
  })
  .partial()
  .strict();

// ---------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------

function getBookRow(id: string): BookRow {
  const row = getDb().prepare("SELECT * FROM books WHERE id = ?").get(id) as BookRow | undefined;
  if (!row) throw notFound("Livre");
  return row;
}

function getSpreadRow(bookId: string, spreadId: string): SpreadRow {
  const row = getDb().prepare("SELECT * FROM spreads WHERE id = ? AND book_id = ?").get(spreadId, bookId) as SpreadRow | undefined;
  if (!row) throw notFound("Double page");
  return row;
}

function spreadRows(bookId: string): SpreadRow[] {
  return getDb().prepare("SELECT * FROM spreads WHERE book_id = ? ORDER BY position").all(bookId) as SpreadRow[];
}

function openRequests(bookId: string): { forAgent: number; forHuman: number } {
  const rows = getDb()
    .prepare(
      "SELECT addressed_to, COUNT(*) n FROM comments WHERE book_id = ? AND parent_id IS NULL AND resolved_at IS NULL AND addressed_to IS NOT NULL GROUP BY addressed_to",
    )
    .all(bookId) as { addressed_to: "agent" | "human"; n: number }[];
  return {
    forAgent: rows.find((r) => r.addressed_to === "agent")?.n ?? 0,
    forHuman: rows.find((r) => r.addressed_to === "human")?.n ?? 0,
  };
}

export function getBook(id: string): Book {
  const db = getDb();
  const row = getBookRow(id);
  const rows = spreadRows(id);
  const assets = loadAssetRefs(db, [row.cover_asset_id, ...rows.map((s) => s.illustration_asset_id)]);
  const spreads = rows.map((s) => toSpread(s, assets));
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    author: row.author,
    illustrator: row.illustrator,
    language: row.language,
    ageMin: row.age_min,
    ageMax: row.age_max,
    status: row.status,
    format: row.format,
    cover: row.cover_asset_id ? (assets.get(row.cover_asset_id) ?? null) : null,
    typography: parseTypography(row.typography),
    brief: row.brief,
    wordsPerSpread: row.words_per_spread,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    version: row.version,
    spreads,
    wordCount: spreads.reduce((n, s) => n + s.wordCount, 0),
    openRequests: openRequests(id),
  };
}

export function getSpread(bookId: string, spreadId: string): Spread {
  const row = getSpreadRow(bookId, spreadId);
  return toSpread(row, loadAssetRefs(getDb(), [row.illustration_asset_id]));
}

export type LibraryFilter = "all" | "active" | "done" | "archived";

export function listBooks(filter: LibraryFilter = "all", query = ""): BookSummary[] {
  const where: string[] = [];
  if (filter === "archived") where.push("b.archived_at IS NOT NULL");
  else where.push("b.archived_at IS NULL");
  if (filter === "active") where.push("b.status != 'done'");
  if (filter === "done") where.push("b.status = 'done'");
  const params: string[] = [];
  if (query.trim()) {
    where.push("(b.title LIKE ? OR b.subtitle LIKE ?)");
    params.push(`%${query.trim()}%`, `%${query.trim()}%`);
  }
  const rows = getDb()
    .prepare(
      `SELECT b.*,
        (SELECT COUNT(*) FROM spreads s WHERE s.book_id = b.id) AS spread_count,
        (SELECT COUNT(*) FROM spreads s WHERE s.book_id = b.id AND trim(s.text) != '' AND s.illustration_asset_id IS NOT NULL) AS complete_count,
        (SELECT s.illustration_asset_id FROM spreads s WHERE s.book_id = b.id AND s.illustration_asset_id IS NOT NULL ORDER BY s.position LIMIT 1) AS first_illustration,
        (SELECT COUNT(*) FROM comments c WHERE c.book_id = b.id AND c.parent_id IS NULL AND c.resolved_at IS NULL AND c.addressed_to = 'agent') AS open_agent,
        (SELECT COUNT(*) FROM comments c WHERE c.book_id = b.id AND c.parent_id IS NULL AND c.resolved_at IS NULL AND c.addressed_to = 'human') AS open_human
       FROM books b WHERE ${where.join(" AND ")} ORDER BY b.updated_at DESC`,
    )
    .all(...params) as (BookRow & {
    spread_count: number;
    complete_count: number;
    first_illustration: string | null;
    open_agent: number;
    open_human: number;
  })[];
  return rows.map((r) => {
    const typo = parseTypography(r.typography);
    const coverId = r.cover_asset_id ?? r.first_illustration;
    return {
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      status: r.status,
      format: r.format,
      coverThumbUrl: coverId ? assetUrls(coverId).thumbUrl : null,
      coverIsIllustration: !r.cover_asset_id && !!r.first_illustration,
      titleFont: typo.titleFont,
      pageColor: typo.pageColor,
      textColor: typo.textColor,
      spreadCount: r.spread_count,
      completeSpreads: r.complete_count,
      updatedAt: r.updated_at,
      archivedAt: r.archived_at,
      openRequests: { forAgent: r.open_agent, forHuman: r.open_human },
    };
  });
}

// ---------------------------------------------------------------------------------------
// Book writes
// ---------------------------------------------------------------------------------------

function touchBook(bookId: string): void {
  getDb().prepare("UPDATE books SET updated_at = ? WHERE id = ?").run(nowIso(), bookId);
}

function insertSpreadRow(row: SpreadRow): void {
  getDb()
    .prepare(
      `INSERT INTO spreads (id, book_id, position, text, illustration_asset_id, illustration_brief, illustration_fit, notes,
        text_align, text_valign, text_size_pt, page_color, created_at, updated_at, updated_by_type, updated_by_name, version)
       VALUES (@id, @book_id, @position, @text, @illustration_asset_id, @illustration_brief, @illustration_fit, @notes,
        @text_align, @text_valign, @text_size_pt, @page_color, @created_at, @updated_at, @updated_by_type, @updated_by_name, @version)`,
    )
    .run(row);
}

function blankSpread(bookId: string, position: number, actor: Actor): SpreadRow {
  const now = nowIso();
  return {
    id: newId(),
    book_id: bookId,
    position,
    text: "",
    illustration_asset_id: null,
    illustration_brief: "",
    illustration_fit: "cover",
    notes: "",
    text_align: null,
    text_valign: null,
    text_size_pt: null,
    page_color: null,
    created_at: now,
    updated_at: now,
    updated_by_type: actor.type,
    updated_by_name: actor.name,
    version: 1,
  };
}

export function createBook(input: z.infer<typeof createBookSchema>, actor: Actor): Book {
  const db = getDb();
  const id = newId();
  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO books (id, title, subtitle, author, illustrator, language, age_min, age_max, status, format, typography, brief, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idea', ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.title,
      input.subtitle ?? "",
      input.author ?? "",
      input.illustrator ?? "",
      input.language ?? "fr",
      input.ageMin ?? null,
      input.ageMax ?? null,
      input.format ?? DEFAULT_FORMAT,
      JSON.stringify(DEFAULT_TYPOGRAPHY),
      input.brief ?? "",
      now,
      now,
    );
    const count = input.spreads ?? 12;
    for (let i = 0; i < count; i++) insertSpreadRow(blankSpread(id, i, actor));
    recordActivity({ bookId: id, actor, action: "book.create", labels: ["livre créé"] });
  })();
  publish("book", id, actor);
  return getBook(id);
}

const BOOK_LABELS: Record<string, string> = {
  title: "titre",
  subtitle: "sous-titre",
  author: "auteurs",
  illustrator: "auteurs",
  language: "langue",
  ageMin: "âge",
  ageMax: "âge",
  format: "format",
  brief: "brief",
  wordsPerSpread: "longueur cible",
  typography: "typographie",
  archived: "archivage",
};

export function updateBook(id: string, patch: z.infer<typeof updateBookSchema>, actor: Actor): Book {
  const db = getDb();
  const before = getBookRow(id);
  const typography: Typography = { ...parseTypography(before.typography), ...(patch.typography ?? {}) };
  const next: BookRow = {
    ...before,
    title: patch.title ?? before.title,
    subtitle: patch.subtitle ?? before.subtitle,
    author: patch.author ?? before.author,
    illustrator: patch.illustrator ?? before.illustrator,
    language: patch.language ?? before.language,
    age_min: patch.ageMin !== undefined ? patch.ageMin : before.age_min,
    age_max: patch.ageMax !== undefined ? patch.ageMax : before.age_max,
    status: patch.status ?? before.status,
    format: patch.format ?? before.format,
    brief: patch.brief ?? before.brief,
    words_per_spread: patch.wordsPerSpread !== undefined ? patch.wordsPerSpread : before.words_per_spread,
    typography: JSON.stringify(typography),
    archived_at: patch.archived === undefined ? before.archived_at : patch.archived ? (before.archived_at ?? nowIso()) : null,
    updated_at: nowIso(),
    version: before.version + 1,
  };
  if (next.age_min !== null && next.age_max !== null && next.age_min > next.age_max) {
    throw badRequest("L'âge minimum dépasse l'âge maximum.");
  }
  const labels = [...new Set(Object.keys(patch).map((k) => BOOK_LABELS[k]).filter((l): l is string => !!l))];
  if (patch.status && patch.status !== before.status) labels.push(`statut : ${STATUS_LABELS[patch.status]}`);
  db.transaction(() => {
    db.prepare(
      `UPDATE books SET title=@title, subtitle=@subtitle, author=@author, illustrator=@illustrator, language=@language,
        age_min=@age_min, age_max=@age_max, status=@status, format=@format, brief=@brief, words_per_spread=@words_per_spread,
        typography=@typography, archived_at=@archived_at, updated_at=@updated_at, version=@version WHERE id=@id`,
    ).run(next);
    if (labels.length > 0) {
      recordActivity({ bookId: id, actor, action: "book.update", labels, snapshot: before, coalesce: true });
    }
  })();
  publish("book", id, actor);
  return getBook(id);
}

/** Humans only (ADR-0002). Files go too: nothing can restore a deleted book. */
export function deleteBook(id: string, actor: Actor): void {
  const db = getDb();
  getBookRow(id);
  const assetIds = (db.prepare("SELECT id FROM assets WHERE book_id = ?").all(id) as { id: string }[]).map((r) => r.id);
  db.transaction(() => {
    db.prepare("UPDATE books SET cover_asset_id = NULL WHERE id = ?").run(id);
    db.prepare("DELETE FROM spreads WHERE book_id = ?").run(id);
    db.prepare("DELETE FROM books WHERE id = ?").run(id);
    db.prepare("DELETE FROM assets WHERE book_id = ?").run(id);
  })();
  deleteAssetFiles(assetIds);
  publish("deleted", id, actor);
}

export function setCover(bookId: string, asset: AssetRow | null, actor: Actor): Book {
  const db = getDb();
  const before = getBookRow(bookId);
  db.transaction(() => {
    db.prepare("UPDATE books SET cover_asset_id = ?, updated_at = ?, version = version + 1 WHERE id = ?").run(
      asset?.id ?? null,
      nowIso(),
      bookId,
    );
    recordActivity({ bookId, actor, action: "book.update", labels: ["couverture"], snapshot: before, coalesce: true });
  })();
  publish("book", bookId, actor);
  return getBook(bookId);
}

// ---------------------------------------------------------------------------------------
// Spread writes
// ---------------------------------------------------------------------------------------

export function addSpread(bookId: string, input: z.infer<typeof createSpreadSchema>, actor: Actor): Spread {
  const db = getDb();
  getBookRow(bookId);
  const count = (db.prepare("SELECT COUNT(*) n FROM spreads WHERE book_id = ?").get(bookId) as { n: number }).n;
  const position = Math.min(input.position ?? count, count);
  const row = blankSpread(bookId, position, actor);
  row.text = input.text ?? "";
  row.illustration_brief = input.illustrationBrief ?? "";
  row.notes = input.notes ?? "";
  db.transaction(() => {
    db.prepare("UPDATE spreads SET position = position + 1 WHERE book_id = ? AND position >= ?").run(bookId, position);
    insertSpreadRow(row);
    recordActivity({ bookId, spreadId: row.id, actor, action: "spread.create", labels: [`double page ${position + 1} ajoutée`] });
    touchBook(bookId);
  })();
  publish("spreads", bookId, actor, row.id);
  return getSpread(bookId, row.id);
}

const SPREAD_LABELS: Record<string, string> = {
  text: "texte",
  illustrationBrief: "brief d'illustration",
  illustrationFit: "cadrage",
  notes: "notes",
  textAlign: "mise en page",
  textValign: "mise en page",
  textSizePt: "mise en page",
  pageColor: "mise en page",
};

export function updateSpread(
  bookId: string,
  spreadId: string,
  patch: z.infer<typeof updateSpreadSchema>,
  actor: Actor,
): Spread {
  const db = getDb();
  const before = getSpreadRow(bookId, spreadId);
  if (patch.baseVersion !== undefined && patch.baseVersion !== before.version) {
    throw new HttpError(409, "conflict", `Double page modifiée entre-temps par ${before.updated_by_name}.`, {
      current: getSpread(bookId, spreadId),
    });
  }
  const { baseVersion: _ignored, ...fields } = patch;
  const changed = Object.entries(fields).filter(([k, v]) => {
    const col = COLUMN_OF[k];
    return col !== undefined && v !== undefined && before[col] !== v;
  });
  if (changed.length === 0) return getSpread(bookId, spreadId);
  const next: SpreadRow = { ...before };
  for (const [k, v] of changed) (next as unknown as Record<string, unknown>)[COLUMN_OF[k] as string] = v;
  next.updated_at = nowIso();
  next.updated_by_type = actor.type;
  next.updated_by_name = actor.name;
  next.version = before.version + 1;
  const labels = [...new Set(changed.map(([k]) => SPREAD_LABELS[k]).filter((l): l is string => !!l))];
  db.transaction(() => {
    writeSpread(next);
    recordActivity({ bookId, spreadId, actor, action: "spread.update", labels, snapshot: before, coalesce: true });
    touchBook(bookId);
  })();
  publish("spread", bookId, actor, spreadId);
  return getSpread(bookId, spreadId);
}

const COLUMN_OF: Record<string, keyof SpreadRow> = {
  text: "text",
  illustrationBrief: "illustration_brief",
  illustrationFit: "illustration_fit",
  notes: "notes",
  textAlign: "text_align",
  textValign: "text_valign",
  textSizePt: "text_size_pt",
  pageColor: "page_color",
};

function writeSpread(row: SpreadRow): void {
  getDb()
    .prepare(
      `UPDATE spreads SET text=@text, illustration_asset_id=@illustration_asset_id, illustration_brief=@illustration_brief,
        illustration_fit=@illustration_fit, notes=@notes, text_align=@text_align, text_valign=@text_valign,
        text_size_pt=@text_size_pt, page_color=@page_color, updated_at=@updated_at, updated_by_type=@updated_by_type,
        updated_by_name=@updated_by_name, version=@version WHERE id=@id`,
    )
    .run(row);
}

export function setIllustration(bookId: string, spreadId: string, asset: AssetRow | null, actor: Actor): Spread {
  const db = getDb();
  const before = getSpreadRow(bookId, spreadId);
  const next: SpreadRow = {
    ...before,
    illustration_asset_id: asset?.id ?? null,
    updated_at: nowIso(),
    updated_by_type: actor.type,
    updated_by_name: actor.name,
    version: before.version + 1,
  };
  db.transaction(() => {
    writeSpread(next);
    recordActivity({
      bookId,
      spreadId,
      actor,
      action: "spread.update",
      labels: [asset ? "illustration" : "illustration retirée"],
      snapshot: before,
      coalesce: true,
    });
    touchBook(bookId);
  })();
  publish("spread", bookId, actor, spreadId);
  return getSpread(bookId, spreadId);
}

export function deleteSpread(bookId: string, spreadId: string, actor: Actor): void {
  const db = getDb();
  const before = getSpreadRow(bookId, spreadId);
  db.transaction(() => {
    db.prepare("DELETE FROM spreads WHERE id = ?").run(spreadId);
    db.prepare("UPDATE spreads SET position = position - 1 WHERE book_id = ? AND position > ?").run(bookId, before.position);
    recordActivity({
      bookId,
      spreadId,
      actor,
      action: "spread.delete",
      labels: [`double page ${before.position + 1} supprimée`],
      snapshot: before,
    });
    touchBook(bookId);
  })();
  publish("spreads", bookId, actor, spreadId);
}

export function reorderSpreads(bookId: string, order: string[], actor: Actor): Book {
  const db = getDb();
  const rows = spreadRows(bookId);
  const current = rows.map((r) => r.id);
  if (order.length !== current.length || new Set(order).size !== order.length || !order.every((id) => current.includes(id))) {
    throw badRequest("L'ordre doit contenir chaque double page du livre une seule fois.", { expected: current });
  }
  if (order.every((id, i) => id === current[i])) return getBook(bookId);
  db.transaction(() => {
    const stmt = db.prepare("UPDATE spreads SET position = ? WHERE id = ?");
    order.forEach((id, i) => stmt.run(i, id));
    recordActivity({ bookId, actor, action: "spread.reorder", labels: ["ordre des doubles pages"], snapshot: current });
    touchBook(bookId);
  })();
  publish("spreads", bookId, actor);
  return getBook(bookId);
}

// ---------------------------------------------------------------------------------------
// Restore (F1.8)
// ---------------------------------------------------------------------------------------

export function restoreActivity(activityId: string, actor: Actor): Book {
  const db = getDb();
  const entry = getActivityRow(activityId);
  if (!entry || !entry.snapshot) throw notFound("Version");
  const bookId = entry.book_id;
  const snapshot = JSON.parse(entry.snapshot) as unknown;
  const when = new Date(entry.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

  db.transaction(() => {
    if (entry.action === "book.update") {
      const before = getBookRow(bookId);
      const s = snapshot as BookRow;
      db.prepare(
        `UPDATE books SET title=@title, subtitle=@subtitle, author=@author, illustrator=@illustrator, language=@language,
          age_min=@age_min, age_max=@age_max, status=@status, format=@format, brief=@brief, words_per_spread=@words_per_spread,
          typography=@typography, cover_asset_id=@cover_asset_id, archived_at=@archived_at, updated_at=@updated_at, version=@version WHERE id=@id`,
      ).run({ ...s, id: bookId, updated_at: nowIso(), version: before.version + 1 });
      recordActivity({ bookId, actor, action: "book.update", labels: [`livre restauré (version du ${when})`], snapshot: before });
    } else if (entry.action === "spread.update" || entry.action === "spread.delete") {
      const s = snapshot as SpreadRow;
      const existing = db.prepare("SELECT * FROM spreads WHERE id = ? AND book_id = ?").get(s.id, bookId) as SpreadRow | undefined;
      const base = { updated_at: nowIso(), updated_by_type: actor.type, updated_by_name: actor.name };
      if (existing) {
        writeSpread({ ...s, ...base, position: existing.position, version: existing.version + 1 });
        recordActivity({ bookId, spreadId: s.id, actor, action: "spread.update", labels: [`restaurée (version du ${when})`], snapshot: existing });
      } else {
        const count = (db.prepare("SELECT COUNT(*) n FROM spreads WHERE book_id = ?").get(bookId) as { n: number }).n;
        const position = Math.min(s.position, count);
        db.prepare("UPDATE spreads SET position = position + 1 WHERE book_id = ? AND position >= ?").run(bookId, position);
        insertSpreadRow({ ...s, ...base, book_id: bookId, position, version: s.version + 1 });
        recordActivity({ bookId, spreadId: s.id, actor, action: "restore", labels: [`double page ${position + 1} rétablie`] });
      }
    } else if (entry.action === "spread.reorder") {
      const order = (snapshot as string[]).filter((id) => spreadRows(bookId).some((r) => r.id === id));
      const rest = spreadRows(bookId).map((r) => r.id).filter((id) => !order.includes(id));
      const current = spreadRows(bookId).map((r) => r.id);
      const stmt = db.prepare("UPDATE spreads SET position = ? WHERE id = ?");
      [...order, ...rest].forEach((id, i) => stmt.run(i, id));
      recordActivity({ bookId, actor, action: "spread.reorder", labels: [`ordre restauré (version du ${when})`], snapshot: current });
    } else {
      throw badRequest("Cette entrée d'historique ne se restaure pas.");
    }
    touchBook(bookId);
  })();
  publish("book", bookId, actor);
  return getBook(bookId);
}

export function bookIdOfActivity(activityId: string): string {
  const entry = getActivityRow(activityId);
  if (!entry) throw notFound("Version");
  return entry.book_id;
}
