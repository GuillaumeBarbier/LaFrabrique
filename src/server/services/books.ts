import { z } from "zod";
import {
  BOOK_STATUSES,
  DEFAULT_FORMAT,
  DEFAULT_TYPOGRAPHY,
  effectiveDpi,
  getFormat,
  ILLUSTRATION_FITS,
  STATUS_LABELS,
  TEXT_ALIGNS,
  TEXT_VALIGNS,
  type Typography,
} from "@/lib/book";
import type { ActivityDetail, Book, BookSummary, Spread } from "@/lib/types";
import { mergeRules, writingGuide, type WritingRules } from "@/lib/writing";
import { deleteAssetFiles, type AssetRow } from "../assets";
import { getDb } from "../db";
import { publish } from "../events";
import type { Actor } from "../http";
import { badRequest, HttpError, newId, notFound, nowIso } from "../util";
import { getActivityRow, recordActivity } from "./activity";
import { copyCharacters, listCharacters, restoreCharacterSnapshot, validCharacterIds } from "./characters";
import { assetUrls, type BookRow, loadAssetRefs, parseIds, parseTypography, type SpreadRow, toSpread } from "./rows";
import { age, formatKey, hex, language, rulesSchema, typographyPatchSchema } from "./schemas";
import { getSeriesRow, parseWords, restoreSeriesSnapshot, seriesDefaults, seriesRules } from "./series";

// ---------------------------------------------------------------------------------------
// Validation (shared by REST and MCP)
// ---------------------------------------------------------------------------------------

export { typographyPatchSchema };

const spreadCount = z.number().int().min(0).max(40);

export const createBookSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    subtitle: z.string().max(200).optional(),
    author: z.string().max(160).optional(),
    illustrator: z.string().max(160).optional(),
    language: language.optional(),
    ageMin: age.optional(),
    ageMax: age.optional(),
    format: formatKey.optional(),
    brief: z.string().max(20_000).optional(),
    wordsPerSpread: z.number().int().min(1).max(1000).nullable().optional(),
    typography: typographyPatchSchema.optional(),
    /** Number of blank spreads (12 by default). `spreads` is the former name. */
    spreadCount: spreadCount.optional(),
    spreads: spreadCount.optional(),
    /** Joins a series: its characters, style, rules and defaults (format, typography, language, ages). */
    seriesId: z.string().max(40).optional(),
    illustrationStyle: rulesSchema.illustrationStyle.optional(),
    writingRules: rulesSchema.writingRules.optional(),
    quoteStyle: rulesSchema.quoteStyle.optional(),
    forbiddenWords: rulesSchema.forbiddenWords.optional(),
  })
  .strict();

export const updateBookSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    subtitle: z.string().max(200),
    author: z.string().max(160),
    illustrator: z.string().max(160),
    language,
    ageMin: age,
    ageMax: age,
    status: z.enum(BOOK_STATUSES),
    format: formatKey,
    brief: z.string().max(20_000),
    wordsPerSpread: z.number().int().min(1).max(1000).nullable(),
    typography: typographyPatchSchema,
    archived: z.boolean(),
    /** Joins (or leaves, with null) a series. Pages lose the characters they no longer see. */
    seriesId: z.string().max(40).nullable(),
    ...rulesSchema,
  })
  .partial()
  .strict();

export const cloneBookSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    subtitle: z.string().max(200).optional(),
    spreadCount: spreadCount.optional(),
    /** Copy the story brief too (off by default: a new story). */
    includeBrief: z.boolean().optional(),
  })
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
    /** Characters present on the spread (ids from book.characters). */
    characterIds: z.array(z.string().max(40)).max(50),
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

/** Style and rules that apply to a book: its series' ones, then its own. */
export function bookRules(row: BookRow): WritingRules {
  const series = row.series_id ? seriesRules(getSeriesRow(row.series_id)) : null;
  return mergeRules(series, {
    illustrationStyle: row.illustration_style,
    writingRules: row.writing_rules,
    quoteStyle: row.quote_style,
    forbiddenWords: parseWords(row.forbidden_words),
    language: row.language,
  });
}

export function getBookRules(id: string): { rules: WritingRules; language: string; wordsPerSpread: number | null; seriesId: string | null } {
  const row = getBookRow(id);
  return { rules: bookRules(row), language: row.language, wordsPerSpread: row.words_per_spread, seriesId: row.series_id };
}

export function getBook(id: string): Book {
  const db = getDb();
  const row = getBookRow(id);
  const rows = spreadRows(id);
  const assets = loadAssetRefs(db, [row.cover_asset_id, ...rows.map((s) => s.illustration_asset_id)]);
  const spreads = rows.map((s) => toSpread(s, assets));
  const series = row.series_id ? getSeriesRow(row.series_id) : null;
  const effective = bookRules(row);
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
    seriesId: row.series_id,
    series: series ? { id: series.id, title: series.title } : null,
    illustrationStyle: row.illustration_style,
    writingRules: row.writing_rules,
    quoteStyle: row.quote_style,
    forbiddenWords: parseWords(row.forbidden_words),
    effective,
    writingGuide: writingGuide(effective, { language: row.language, wordsPerSpread: row.words_per_spread }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    version: row.version,
    spreads,
    characters: listCharacters(id),
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
        text_align, text_valign, text_size_pt, page_color, character_ids, created_at, updated_at, updated_by_type, updated_by_name, version)
       VALUES (@id, @book_id, @position, @text, @illustration_asset_id, @illustration_brief, @illustration_fit, @notes,
        @text_align, @text_valign, @text_size_pt, @page_color, @character_ids, @created_at, @updated_at, @updated_by_type, @updated_by_name, @version)`,
    )
    // Snapshots taken before migration 2 have no character_ids.
    .run({ ...row, character_ids: row.character_ids ?? "[]" });
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
    character_ids: "[]",
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
  // A book of a series starts from the series' defaults; what is given wins.
  const series = input.seriesId ? getSeriesRow(input.seriesId) : null;
  const defaults = series ? seriesDefaults(series) : null;
  const ageMin = input.ageMin !== undefined ? input.ageMin : (defaults?.ageMin ?? null);
  const ageMax = input.ageMax !== undefined ? input.ageMax : (defaults?.ageMax ?? null);
  if (ageMin !== null && ageMax !== null && ageMin > ageMax) throw badRequest("L'âge minimum dépasse l'âge maximum.");
  const typography: Typography = { ...DEFAULT_TYPOGRAPHY, ...(defaults?.typography ?? {}), ...(input.typography ?? {}) };
  db.transaction(() => {
    db.prepare(
      `INSERT INTO books (id, title, subtitle, author, illustrator, language, age_min, age_max, status, format, typography, brief,
        words_per_spread, series_id, illustration_style, writing_rules, quote_style, forbidden_words, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idea', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.title,
      input.subtitle ?? "",
      input.author ?? "",
      input.illustrator ?? "",
      input.language ?? defaults?.language ?? "fr",
      ageMin,
      ageMax,
      input.format ?? defaults?.format ?? DEFAULT_FORMAT,
      JSON.stringify(typography),
      input.brief ?? "",
      input.wordsPerSpread !== undefined ? input.wordsPerSpread : (defaults?.wordsPerSpread ?? null),
      series?.id ?? null,
      input.illustrationStyle ?? "",
      input.writingRules ?? "",
      input.quoteStyle ?? null,
      JSON.stringify(input.forbiddenWords ?? []),
      now,
      now,
    );
    const count = input.spreadCount ?? input.spreads ?? 12;
    for (let i = 0; i < count; i++) insertSpreadRow(blankSpread(id, i, actor));
    recordActivity({ bookId: id, actor, action: "book.create", labels: [series ? `livre créé dans la série « ${series.title} »` : "livre créé"] });
  })();
  publish("book", id, actor);
  return getBook(id);
}

/**
 * A new book with the setup of another: series, format, typography, language, ages, style,
 * rules, and copies of its own characters with their images. No pages are copied.
 */
export function cloneBookSetup(fromBookId: string, input: z.infer<typeof cloneBookSchema>, actor: Actor): { book: Book; copiedCharacters: number } {
  const db = getDb();
  const from = getBookRow(fromBookId);
  let book!: Book;
  let copied = 0;
  db.transaction(() => {
    book = createBook(
      {
        title: input.title,
        subtitle: input.subtitle,
        author: from.author,
        illustrator: from.illustrator,
        language: from.language,
        ageMin: from.age_min,
        ageMax: from.age_max,
        format: from.format as z.infer<typeof formatKey>,
        typography: parseTypography(from.typography),
        wordsPerSpread: from.words_per_spread,
        brief: input.includeBrief ? from.brief : "",
        spreadCount: input.spreadCount ?? 12,
        seriesId: from.series_id ?? undefined,
        illustrationStyle: from.illustration_style,
        writingRules: from.writing_rules,
        quoteStyle: from.quote_style,
        forbiddenWords: parseWords(from.forbidden_words),
      },
      actor,
    );
    copied = copyCharacters(fromBookId, book.id, actor);
  })();
  return { book: getBook(book.id), copiedCharacters: copied };
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
  seriesId: "série",
  illustrationStyle: "style d'illustration",
  writingRules: "règles d'écriture",
  quoteStyle: "guillemets",
  forbiddenWords: "mots à éviter",
};

export function updateBook(id: string, patch: z.infer<typeof updateBookSchema>, actor: Actor): Book {
  return updateBookWithChanges(id, patch, actor).book;
}

export function updateBookWithChanges(id: string, patch: z.infer<typeof updateBookSchema>, actor: Actor): { book: Book; changed: string[] } {
  const db = getDb();
  const before = getBookRow(id);
  if (patch.seriesId) getSeriesRow(patch.seriesId);
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
    series_id: patch.seriesId !== undefined ? patch.seriesId : before.series_id,
    illustration_style: patch.illustrationStyle ?? before.illustration_style,
    writing_rules: patch.writingRules ?? before.writing_rules,
    quote_style: patch.quoteStyle !== undefined ? patch.quoteStyle : before.quote_style,
    forbidden_words: patch.forbiddenWords !== undefined ? JSON.stringify(patch.forbiddenWords) : before.forbidden_words,
    updated_at: nowIso(),
    version: before.version + 1,
  };
  if (next.age_min !== null && next.age_max !== null && next.age_min > next.age_max) {
    throw badRequest("L'âge minimum dépasse l'âge maximum.");
  }
  const COLUMN: Record<string, keyof BookRow> = {
    title: "title",
    subtitle: "subtitle",
    author: "author",
    illustrator: "illustrator",
    language: "language",
    ageMin: "age_min",
    ageMax: "age_max",
    status: "status",
    format: "format",
    brief: "brief",
    wordsPerSpread: "words_per_spread",
    typography: "typography",
    archived: "archived_at",
    seriesId: "series_id",
    illustrationStyle: "illustration_style",
    writingRules: "writing_rules",
    quoteStyle: "quote_style",
    forbiddenWords: "forbidden_words",
  };
  const changed = Object.keys(patch).filter((k) => COLUMN[k] && next[COLUMN[k]] !== before[COLUMN[k]]);
  if (changed.length === 0) return { book: getBook(id), changed };
  const labels = [...new Set(changed.map((k) => BOOK_LABELS[k]).filter((l): l is string => !!l))];
  if (changed.includes("status")) labels.push(`statut : ${STATUS_LABELS[next.status]}`);
  db.transaction(() => {
    db.prepare(
      `UPDATE books SET title=@title, subtitle=@subtitle, author=@author, illustrator=@illustrator, language=@language,
        age_min=@age_min, age_max=@age_max, status=@status, format=@format, brief=@brief, words_per_spread=@words_per_spread,
        typography=@typography, archived_at=@archived_at, series_id=@series_id, illustration_style=@illustration_style,
        writing_rules=@writing_rules, quote_style=@quote_style, forbidden_words=@forbidden_words, updated_at=@updated_at,
        version=@version WHERE id=@id`,
    ).run(next);
    if (next.series_id !== before.series_id) {
      // Pages forget the characters of the series the book left (derived clean-up, no version bump).
      const known = new Set(listCharacters(id).map((c) => c.id));
      const clean = db.prepare("UPDATE spreads SET character_ids = ? WHERE id = ?");
      for (const s of spreadRows(id)) {
        const ids = parseIds(s.character_ids);
        if (ids.some((x) => !known.has(x))) clean.run(JSON.stringify(ids.filter((x) => known.has(x))), s.id);
      }
    }
    recordActivity({ bookId: id, actor, action: "book.update", labels, snapshot: before, coalesce: true });
  })();
  publish("book", id, actor);
  return { book: getBook(id), changed };
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

/** Print resolution of an image on one page of the book (bleed included). */
export function imageDpi(bookId: string, asset: Pick<AssetRow, "width" | "height">): number | null {
  if (!asset.width || !asset.height) return null;
  return effectiveDpi(getFormat(getBookRow(bookId).format), asset.width, asset.height);
}

function imageChange(bookId: string, target: "spread_illustration" | "cover", targetId: string | null, asset: AssetRow | null, previous: string | null): ActivityDetail {
  return {
    target,
    targetId,
    assetId: asset?.id ?? null,
    previousAssetId: previous,
    filename: asset?.original_name ?? null,
    width: asset?.width ?? null,
    height: asset?.height ?? null,
    dpi: asset ? imageDpi(bookId, asset) : null,
    ...(asset ? {} : { removed: true }),
  };
}

/** Each image change is its own history entry: any one can be undone. */
export function setCover(bookId: string, asset: AssetRow | null, actor: Actor): Book {
  const db = getDb();
  const before = getBookRow(bookId);
  db.transaction(() => {
    db.prepare("UPDATE books SET cover_asset_id = ?, updated_at = ?, version = version + 1 WHERE id = ?").run(
      asset?.id ?? null,
      nowIso(),
      bookId,
    );
    recordActivity({
      bookId,
      actor,
      action: "book.update",
      labels: [asset ? "couverture" : "couverture retirée"],
      snapshot: before,
      details: [imageChange(bookId, "cover", null, asset, before.cover_asset_id)],
    });
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
  characterIds: "personnages",
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
  const { baseVersion: _ignored, characterIds, ...rest } = patch;
  const fields = {
    ...rest,
    characterIds: characterIds === undefined ? undefined : JSON.stringify(validCharacterIds(bookId, characterIds)),
  };
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
  characterIds: "character_ids",
};

function writeSpread(row: SpreadRow): void {
  getDb()
    .prepare(
      `UPDATE spreads SET text=@text, illustration_asset_id=@illustration_asset_id, illustration_brief=@illustration_brief,
        illustration_fit=@illustration_fit, notes=@notes, text_align=@text_align, text_valign=@text_valign,
        text_size_pt=@text_size_pt, page_color=@page_color, character_ids=@character_ids, updated_at=@updated_at,
        updated_by_type=@updated_by_type, updated_by_name=@updated_by_name, version=@version WHERE id=@id`,
    )
    .run({ ...row, character_ids: row.character_ids ?? "[]" });
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
      labels: [asset ? `illustration${asset.original_name ? ` (${asset.original_name})` : ""}` : "illustration retirée"],
      snapshot: before,
      details: [imageChange(bookId, "spread_illustration", spreadId, asset, before.illustration_asset_id)],
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

/** Puts back the state from before a history entry. Returns the books it touched. */
export function restoreActivity(activityId: string, actor: Actor): { bookIds: string[]; seriesId: string | null } {
  const db = getDb();
  const entry = getActivityRow(activityId);
  if (!entry || !entry.snapshot) throw notFound("Version");
  const snapshot = JSON.parse(entry.snapshot) as unknown;
  const when = new Date(entry.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
  let touched: string[] = entry.book_id ? [entry.book_id] : [];

  db.transaction(() => {
    if (entry.action === "character.update" || entry.action === "character.delete") {
      touched = restoreCharacterSnapshot(snapshot, when, actor);
      return;
    }
    if (entry.action === "series.update") {
      touched = restoreSeriesSnapshot(snapshot, when, actor);
      return;
    }
    const bookId = entry.book_id;
    if (!bookId) throw badRequest("Cette entrée d'historique ne se restaure pas.");
    if (entry.action === "book.update") {
      const before = getBookRow(bookId);
      // Snapshots from before migration 4 have no style or rules; the series link is not restored.
      const s = { illustration_style: "", writing_rules: "", quote_style: null, forbidden_words: "[]", ...(snapshot as Partial<BookRow>) } as BookRow;
      db.prepare(
        `UPDATE books SET title=@title, subtitle=@subtitle, author=@author, illustrator=@illustrator, language=@language,
          age_min=@age_min, age_max=@age_max, status=@status, format=@format, brief=@brief, words_per_spread=@words_per_spread,
          typography=@typography, cover_asset_id=@cover_asset_id, archived_at=@archived_at, illustration_style=@illustration_style,
          writing_rules=@writing_rules, quote_style=@quote_style, forbidden_words=@forbidden_words, updated_at=@updated_at,
          version=@version WHERE id=@id`,
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
  for (const bookId of touched) publish("book", bookId, actor);
  return { bookIds: touched, seriesId: entry.series_id };
}

