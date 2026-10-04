import { z } from "zod";
import type { Typography } from "@/lib/book";
import type { BookStatus } from "@/lib/book";
import type { Series, SeriesSummary } from "@/lib/types";
import type { ForbiddenWord, QuoteStyle } from "@/lib/writing";
import { getDb } from "../db";
import { publish } from "../events";
import type { Actor } from "../http";
import { badRequest, newId, notFound, nowIso } from "../util";
import { recordActivity } from "./activity";
import { booksOf, listOwnerCharacters, moveCharactersToSeries } from "./characters";
import { age, formatKey, language, rulesSchema, typographyPatchSchema } from "./schemas";

// Series (ADR-0008): a universe shared by several books. Its characters are linked to every
// book of the series (not copied); its style and rules come before each book's own; its
// format, typography, language and ages are the defaults of a new book.

const seriesFields = {
  title: z.string().trim().min(1).max(160),
  description: z.string().max(20_000),
  ...rulesSchema,
  language,
  ageMin: age,
  ageMax: age,
  format: formatKey.nullable(),
  typography: typographyPatchSchema.nullable(),
  wordsPerSpread: z.number().int().min(1).max(1000).nullable(),
};

export const createSeriesSchema = z
  .object({
    ...seriesFields,
    /** Turns a "model" book into the first book of the series: its characters move up to the series. */
    fromBookId: z.string().max(40),
  })
  .partial()
  .required({ title: true })
  .strict();

export const updateSeriesSchema = z
  .object({ ...seriesFields, archived: z.boolean() })
  .partial()
  .strict();

export interface SeriesRow {
  id: string;
  title: string;
  description: string;
  illustration_style: string;
  writing_rules: string;
  quote_style: QuoteStyle | null;
  forbidden_words: string;
  language: string;
  age_min: number | null;
  age_max: number | null;
  format: string | null;
  typography: string | null;
  words_per_spread: number | null;
  created_at: string;
  updated_at: string;
  updated_by_type: "human" | "agent";
  updated_by_name: string;
  archived_at: string | null;
  version: number;
}

export function parseWords(json: string | null | undefined): ForbiddenWord[] {
  try {
    const value = JSON.parse(json ?? "[]") as unknown;
    return Array.isArray(value) ? (value as ForbiddenWord[]).filter((w) => typeof w?.word === "string") : [];
  } catch {
    return [];
  }
}

function parsePartialTypography(json: string | null): Partial<Typography> | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Partial<Typography>;
  } catch {
    return null;
  }
}

export function getSeriesRow(id: string): SeriesRow {
  const row = getDb().prepare("SELECT * FROM series WHERE id = ?").get(id) as SeriesRow | undefined;
  if (!row) throw notFound("Série");
  return row;
}

export function seriesDefaults(row: SeriesRow): {
  language: string;
  ageMin: number | null;
  ageMax: number | null;
  format: string | null;
  typography: Partial<Typography> | null;
  wordsPerSpread: number | null;
} {
  return {
    language: row.language,
    ageMin: row.age_min,
    ageMax: row.age_max,
    format: row.format,
    typography: parsePartialTypography(row.typography),
    wordsPerSpread: row.words_per_spread,
  };
}

export function seriesRules(row: SeriesRow): {
  illustrationStyle: string;
  writingRules: string;
  quoteStyle: QuoteStyle | null;
  forbiddenWords: ForbiddenWord[];
} {
  return {
    illustrationStyle: row.illustration_style,
    writingRules: row.writing_rules,
    quoteStyle: row.quote_style,
    forbiddenWords: parseWords(row.forbidden_words),
  };
}

export function getSeries(id: string): Series {
  const row = getSeriesRow(id);
  const books = getDb().prepare("SELECT id, title, status FROM books WHERE series_id = ? ORDER BY created_at").all(id) as {
    id: string;
    title: string;
    status: BookStatus;
  }[];
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    ...seriesRules(row),
    ...seriesDefaults(row),
    characters: listOwnerCharacters({ seriesId: id }),
    books,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: { type: row.updated_by_type, name: row.updated_by_name },
    archivedAt: row.archived_at,
    version: row.version,
  };
}

export function listSeries(includeArchived = false): SeriesSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM characters c WHERE c.series_id = s.id) AS character_count,
              (SELECT COUNT(*) FROM books b WHERE b.series_id = s.id) AS book_count
       FROM series s ${includeArchived ? "" : "WHERE s.archived_at IS NULL"} ORDER BY s.updated_at DESC`,
    )
    .all() as (SeriesRow & { character_count: number; book_count: number })[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    characterCount: r.character_count,
    bookCount: r.book_count,
    updatedAt: r.updated_at,
  }));
}

function announce(seriesId: string, actor: Actor): void {
  for (const bookId of booksOf({ book_id: null, series_id: seriesId })) publish("book", bookId, actor);
}

interface BookModelRow {
  id: string;
  title: string;
  series_id: string | null;
  illustration_style: string;
  writing_rules: string;
  quote_style: QuoteStyle | null;
  forbidden_words: string;
  language: string;
  age_min: number | null;
  age_max: number | null;
  format: string;
  typography: string;
  words_per_spread: number | null;
}

export function createSeries(input: z.infer<typeof createSeriesSchema>, actor: Actor): { series: Series; movedCharacters: number } {
  const db = getDb();
  const model = input.fromBookId
    ? (db.prepare("SELECT * FROM books WHERE id = ?").get(input.fromBookId) as BookModelRow | undefined)
    : undefined;
  if (input.fromBookId && !model) throw notFound("Livre");
  if (model?.series_id) throw badRequest("Ce livre appartient déjà à une série.");
  const now = nowIso();
  const row: SeriesRow = {
    id: newId(),
    title: input.title,
    description: input.description ?? "",
    illustration_style: input.illustrationStyle ?? model?.illustration_style ?? "",
    writing_rules: input.writingRules ?? model?.writing_rules ?? "",
    quote_style: input.quoteStyle !== undefined ? input.quoteStyle : (model?.quote_style ?? null),
    forbidden_words: JSON.stringify(input.forbiddenWords ?? parseWords(model?.forbidden_words)),
    language: input.language ?? model?.language ?? "fr",
    age_min: input.ageMin !== undefined ? input.ageMin : (model?.age_min ?? null),
    age_max: input.ageMax !== undefined ? input.ageMax : (model?.age_max ?? null),
    format: input.format !== undefined ? input.format : (model?.format ?? null),
    typography:
      input.typography !== undefined ? (input.typography ? JSON.stringify(input.typography) : null) : (model?.typography ?? null),
    words_per_spread: input.wordsPerSpread !== undefined ? input.wordsPerSpread : (model?.words_per_spread ?? null),
    created_at: now,
    updated_at: now,
    updated_by_type: actor.type,
    updated_by_name: actor.name,
    archived_at: null,
    version: 1,
  };
  if (row.age_min !== null && row.age_max !== null && row.age_min > row.age_max) throw badRequest("L'âge minimum dépasse l'âge maximum.");
  let moved = 0;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO series (id, title, description, illustration_style, writing_rules, quote_style, forbidden_words, language, age_min, age_max,
        format, typography, words_per_spread, created_at, updated_at, updated_by_type, updated_by_name, archived_at, version)
       VALUES (@id, @title, @description, @illustration_style, @writing_rules, @quote_style, @forbidden_words, @language, @age_min, @age_max,
        @format, @typography, @words_per_spread, @created_at, @updated_at, @updated_by_type, @updated_by_name, @archived_at, @version)`,
    ).run(row);
    recordActivity({ bookId: null, seriesId: row.id, actor, action: "series.create", labels: [`série « ${row.title} » créée`] });
    if (model) {
      // The model's characters, style and rules move up: the series now carries them.
      moved = moveCharactersToSeries(model.id, row.id);
      db.prepare(
        `UPDATE books SET series_id = ?, illustration_style = '', writing_rules = '', quote_style = NULL, forbidden_words = '[]',
          updated_at = ?, version = version + 1 WHERE id = ?`,
      ).run(row.id, now, model.id);
      recordActivity({
        bookId: model.id,
        actor,
        action: "book.update",
        labels: [`modèle de la série « ${row.title} » (${moved} personnage${moved > 1 ? "s" : ""} partagé${moved > 1 ? "s" : ""})`],
      });
    }
  })();
  if (model) publish("book", model.id, actor);
  return { series: getSeries(row.id), movedCharacters: moved };
}

const LABELS: Record<string, string> = {
  title: "titre",
  description: "description",
  illustrationStyle: "style d'illustration",
  writingRules: "règles d'écriture",
  quoteStyle: "guillemets",
  forbiddenWords: "mots à éviter",
  language: "langue",
  ageMin: "âge",
  ageMax: "âge",
  format: "format",
  typography: "typographie",
  wordsPerSpread: "longueur cible",
  archived: "archivage",
};

export function updateSeries(id: string, patch: z.infer<typeof updateSeriesSchema>, actor: Actor): { series: Series; changed: string[] } {
  const db = getDb();
  const before = getSeriesRow(id);
  const next: SeriesRow = {
    ...before,
    title: patch.title ?? before.title,
    description: patch.description ?? before.description,
    illustration_style: patch.illustrationStyle ?? before.illustration_style,
    writing_rules: patch.writingRules ?? before.writing_rules,
    quote_style: patch.quoteStyle !== undefined ? patch.quoteStyle : before.quote_style,
    forbidden_words: patch.forbiddenWords !== undefined ? JSON.stringify(patch.forbiddenWords) : before.forbidden_words,
    language: patch.language ?? before.language,
    age_min: patch.ageMin !== undefined ? patch.ageMin : before.age_min,
    age_max: patch.ageMax !== undefined ? patch.ageMax : before.age_max,
    format: patch.format !== undefined ? patch.format : before.format,
    typography:
      patch.typography !== undefined
        ? patch.typography
          ? JSON.stringify({ ...(parsePartialTypography(before.typography) ?? {}), ...patch.typography })
          : null
        : before.typography,
    words_per_spread: patch.wordsPerSpread !== undefined ? patch.wordsPerSpread : before.words_per_spread,
    archived_at: patch.archived === undefined ? before.archived_at : patch.archived ? (before.archived_at ?? nowIso()) : null,
    updated_at: nowIso(),
    updated_by_type: actor.type,
    updated_by_name: actor.name,
    version: before.version + 1,
  };
  if (next.age_min !== null && next.age_max !== null && next.age_min > next.age_max) throw badRequest("L'âge minimum dépasse l'âge maximum.");
  const columns: (keyof SeriesRow)[] = [
    "title",
    "description",
    "illustration_style",
    "writing_rules",
    "quote_style",
    "forbidden_words",
    "language",
    "age_min",
    "age_max",
    "format",
    "typography",
    "words_per_spread",
    "archived_at",
  ];
  const changedColumns = columns.filter((c) => next[c] !== before[c]);
  if (changedColumns.length === 0) return { series: getSeries(id), changed: [] };
  const changed = Object.keys(patch).filter((k) => {
    const col = k === "archived" ? "archived_at" : k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    return changedColumns.includes(col as keyof SeriesRow);
  });
  db.transaction(() => {
    db.prepare(
      `UPDATE series SET title=@title, description=@description, illustration_style=@illustration_style, writing_rules=@writing_rules,
        quote_style=@quote_style, forbidden_words=@forbidden_words, language=@language, age_min=@age_min, age_max=@age_max, format=@format,
        typography=@typography, words_per_spread=@words_per_spread, archived_at=@archived_at, updated_at=@updated_at,
        updated_by_type=@updated_by_type, updated_by_name=@updated_by_name, version=@version WHERE id=@id`,
    ).run(next);
    const labels = [...new Set(changed.map((k) => LABELS[k]).filter((l): l is string => !!l))];
    recordActivity({ bookId: null, seriesId: id, actor, action: "series.update", labels, snapshot: before, coalesce: true });
  })();
  announce(id, actor);
  return { series: getSeries(id), changed };
}

/** Puts a series' settings back (restoreActivity, in its transaction). */
export function restoreSeriesSnapshot(raw: unknown, when: string, actor: Actor): string[] {
  const db = getDb();
  const s = raw as SeriesRow;
  const before = getSeriesRow(s.id);
  db.prepare(
    `UPDATE series SET title=@title, description=@description, illustration_style=@illustration_style, writing_rules=@writing_rules,
      quote_style=@quote_style, forbidden_words=@forbidden_words, language=@language, age_min=@age_min, age_max=@age_max, format=@format,
      typography=@typography, words_per_spread=@words_per_spread, archived_at=@archived_at, updated_at=@updated_at,
      updated_by_type=@updated_by_type, updated_by_name=@updated_by_name, version=@version WHERE id=@id`,
  ).run({ ...s, updated_at: nowIso(), updated_by_type: actor.type, updated_by_name: actor.name, version: before.version + 1 });
  recordActivity({ bookId: null, seriesId: s.id, actor, action: "series.update", labels: [`série restaurée (version du ${when})`], snapshot: before });
  return booksOf({ book_id: null, series_id: s.id });
}
