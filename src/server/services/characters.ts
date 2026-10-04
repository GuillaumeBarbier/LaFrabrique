import { z } from "zod";
import type { ActivityDetail, Character, CharacterImage, CharacterReference, References } from "@/lib/types";
import { inferView, viewRank } from "@/lib/views";
import { copyAsset, getAsset, type AssetRow } from "../assets";
import { getDb } from "../db";
import { publish } from "../events";
import type { Actor } from "../http";
import { SIGNED_TTL_SECONDS, signedAssetUrl } from "../signing";
import { badRequest, newId, notFound, nowIso } from "../util";
import { recordActivity } from "./activity";
import { loadAssetRefs, parseIds } from "./rows";
import { imageView } from "./schemas";

// Characters (F2.1, ADR-0006; series in ADR-0008): a sheet (name, role, appearance in words)
// and reference images with a normalised view, so that every illustration draws them the
// same way. A character belongs to a book, or to a series and is then shared by its books.

const view = imageView;

export const characterImageSchema = z
  .object({
    label: z.string().max(80),
    view,
    primary: z.boolean(),
    /** New place in the character's images (0 = first). */
    position: z.number().int().min(0),
  })
  .partial()
  .strict();

export const createCharacterSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    role: z.string().max(500).optional(),
    appearance: z.string().max(5_000).optional(),
    /** Place among the owner's characters (0 = first); at the end by default. */
    position: z.number().int().min(0).optional(),
    /** Copy this character (sheet and images) as a starting point. */
    sourceCharacterId: z.string().max(40).optional(),
    /** Reference images already uploaded (POST /api/v1/uploads). */
    images: z
      .array(
        z
          .object({ uploadId: z.string().max(40), label: z.string().max(80).optional(), view: view.optional(), primary: z.boolean().optional() })
          .strict(),
      )
      .max(30)
      .optional(),
  })
  .strict();

export const updateCharacterSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    role: z.string().max(500),
    appearance: z.string().max(5_000),
    position: z.number().int().min(0),
  })
  .partial()
  .strict();

export const reorderCharactersSchema = z.object({ order: z.array(z.string().max(40)).min(1).max(200) }).strict();

export type Owner = { bookId: string; seriesId?: undefined } | { seriesId: string; bookId?: undefined };

export interface CharacterRow {
  id: string;
  book_id: string | null;
  series_id: string | null;
  position: number;
  name: string;
  role: string;
  appearance: string;
  created_at: string;
  updated_at: string;
  updated_by_type: "human" | "agent";
  updated_by_name: string;
  version: number;
}

export interface CharacterImageRow {
  id: string;
  character_id: string;
  asset_id: string;
  label: string;
  view: string;
  is_primary: number;
  position: number;
  created_at: string;
  created_by_type: "human" | "agent";
  created_by_name: string;
}

/** State before a change, for the history (restore). */
interface CharacterSnapshot {
  character: CharacterRow;
  images: CharacterImageRow[];
  spreadIds?: string[];
}

/** An image to attach: stored asset plus what it shows. */
export interface NewImage {
  asset: AssetRow;
  label?: string;
  view?: string;
  primary?: boolean;
}

// ---------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------

export function seriesOfBook(bookId: string): string | null {
  const row = getDb().prepare("SELECT series_id FROM books WHERE id = ?").get(bookId) as { series_id: string | null } | undefined;
  if (!row) throw notFound("Livre");
  return row.series_id;
}

function assertOwner(owner: Owner): void {
  if (owner.bookId) seriesOfBook(owner.bookId);
  else if (!getDb().prepare("SELECT 1 FROM series WHERE id = ?").get(owner.seriesId)) throw notFound("Série");
}

export function characterRow(id: string): CharacterRow {
  const row = getDb().prepare("SELECT * FROM characters WHERE id = ?").get(id) as CharacterRow | undefined;
  if (!row) throw notFound("Personnage");
  return row;
}

/** A character the book can use: its own, or one of its series. */
export function characterOfBook(bookId: string, id: string): CharacterRow {
  const seriesId = seriesOfBook(bookId);
  const row = getDb().prepare("SELECT * FROM characters WHERE id = ?").get(id) as CharacterRow | undefined;
  if (!row || !(row.book_id === bookId || (seriesId !== null && row.series_id === seriesId))) throw notFound("Personnage");
  return row;
}

function ownerRows(owner: Owner): CharacterRow[] {
  return owner.bookId
    ? (getDb().prepare("SELECT * FROM characters WHERE book_id = ? ORDER BY position").all(owner.bookId) as CharacterRow[])
    : (getDb().prepare("SELECT * FROM characters WHERE series_id = ? ORDER BY position").all(owner.seriesId) as CharacterRow[]);
}

/** Characters a book uses: the series' first, then its own. */
function bookRows(bookId: string): CharacterRow[] {
  const seriesId = seriesOfBook(bookId);
  return [...(seriesId ? ownerRows({ seriesId }) : []), ...ownerRows({ bookId })];
}

function imageRows(characterIds: string[]): CharacterImageRow[] {
  if (characterIds.length === 0) return [];
  return getDb()
    .prepare(`SELECT * FROM character_images WHERE character_id IN (${characterIds.map(() => "?").join(",")}) ORDER BY position, rowid`)
    .all(...characterIds) as CharacterImageRow[];
}

function snapshot(row: CharacterRow): CharacterSnapshot {
  return { character: row, images: imageRows([row.id]) };
}

function viewOf(i: Pick<CharacterImageRow, "view" | "label">): string {
  return i.view || inferView(i.label);
}

function toCharacters(rows: CharacterRow[]): Character[] {
  const images = imageRows(rows.map((r) => r.id));
  const assets = loadAssetRefs(getDb(), images.map((i) => i.asset_id));
  return rows.map((r) => ({
    id: r.id,
    bookId: r.book_id,
    seriesId: r.series_id,
    name: r.name,
    role: r.role,
    appearance: r.appearance,
    position: r.position,
    images: images
      .filter((i) => i.character_id === r.id)
      .flatMap((i, index): CharacterImage[] => {
        const image = assets.get(i.asset_id);
        return image
          ? [
              {
                id: i.id,
                label: i.label,
                view: viewOf(i),
                primary: i.is_primary === 1,
                position: index,
                image,
                createdAt: i.created_at,
                createdBy: { type: i.created_by_type, name: i.created_by_name },
              },
            ]
          : [];
      }),
    updatedAt: r.updated_at,
    updatedBy: { type: r.updated_by_type, name: r.updated_by_name },
    version: r.version,
  }));
}

export function listCharacters(bookId: string): Character[] {
  return toCharacters(bookRows(bookId));
}

export function listOwnerCharacters(owner: Owner): Character[] {
  assertOwner(owner);
  return toCharacters(ownerRows(owner));
}

export function getCharacter(id: string): Character {
  return toCharacters([characterRow(id)])[0] as Character;
}

/** Keeps only ids of the book's characters (own or series), without duplicates, in the given order. */
export function validCharacterIds(bookId: string, ids: string[]): string[] {
  const known = new Set(bookRows(bookId).map((r) => r.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) throw badRequest(`Personnage(s) inconnu(s) dans ce livre : ${unknown.join(", ")}.`);
  return [...new Set(ids)];
}

// ---------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------

/** Books whose pages show this character. */
export function booksOf(row: Pick<CharacterRow, "book_id" | "series_id">): string[] {
  if (row.book_id) return [row.book_id];
  return (getDb().prepare("SELECT id FROM books WHERE series_id = ?").all(row.series_id) as { id: string }[]).map((r) => r.id);
}

function announce(row: Pick<CharacterRow, "book_id" | "series_id">, actor: Actor): void {
  for (const bookId of booksOf(row)) publish("book", bookId, actor);
}

function touchOwner(row: Pick<CharacterRow, "book_id" | "series_id">, now = nowIso()): void {
  if (row.book_id) getDb().prepare("UPDATE books SET updated_at = ? WHERE id = ?").run(now, row.book_id);
  else getDb().prepare("UPDATE series SET updated_at = ? WHERE id = ?").run(now, row.series_id);
}

function touch(row: CharacterRow, actor: Actor): void {
  const now = nowIso();
  getDb()
    .prepare("UPDATE characters SET updated_at = ?, updated_by_type = ?, updated_by_name = ?, version = version + 1 WHERE id = ?")
    .run(now, actor.type, actor.name, row.id);
  touchOwner(row, now);
}

function record(
  row: Pick<CharacterRow, "id" | "book_id" | "series_id">,
  actor: Actor,
  action: "character.create" | "character.update" | "character.delete" | "restore",
  labels: string[],
  extra: { snapshot?: unknown; details?: ActivityDetail[]; coalesce?: boolean } = {},
): void {
  recordActivity({ bookId: row.book_id, seriesId: row.series_id, characterId: row.id, actor, action, labels, ...extra });
}

function insertCharacter(row: CharacterRow): void {
  getDb()
    .prepare(
      `INSERT INTO characters (id, book_id, series_id, position, name, role, appearance, created_at, updated_at, updated_by_type, updated_by_name, version)
       VALUES (@id, @book_id, @series_id, @position, @name, @role, @appearance, @created_at, @updated_at, @updated_by_type, @updated_by_name, @version)`,
    )
    .run(row);
}

function insertImage(row: CharacterImageRow): void {
  getDb()
    .prepare(
      `INSERT INTO character_images (id, character_id, asset_id, label, view, is_primary, position, created_at, created_by_type, created_by_name)
       VALUES (@id, @character_id, @asset_id, @label, @view, @is_primary, @position, @created_at, @created_by_type, @created_by_name)`,
    )
    // Snapshots taken before migration 4 have no view.
    .run({ ...row, view: row.view ?? "" });
}

function renumber(ids: string[]): void {
  const stmt = getDb().prepare("UPDATE characters SET position = ? WHERE id = ?");
  ids.forEach((id, i) => stmt.run(i, id));
}

function imageDetail(characterId: string, image: Pick<CharacterImageRow, "id" | "asset_id" | "label" | "view">, asset?: AssetRow, removed = false): ActivityDetail {
  return {
    target: "character_image",
    targetId: characterId,
    imageId: image.id,
    assetId: image.asset_id,
    filename: asset?.original_name ?? null,
    width: asset?.width ?? null,
    height: asset?.height ?? null,
    view: viewOf(image),
    label: image.label,
    ...(removed ? { removed: true } : {}),
  };
}

/** Appends images to a character (inside the caller's transaction). Returns the new image ids. */
function appendImages(characterId: string, images: NewImage[], actor: Actor): string[] {
  const db = getDb();
  let count = (db.prepare("SELECT COUNT(*) n FROM character_images WHERE character_id = ?").get(characterId) as { n: number }).n;
  const ids: string[] = [];
  for (const img of images) {
    const primary = img.primary === true || count === 0;
    if (primary) db.prepare("UPDATE character_images SET is_primary = 0 WHERE character_id = ?").run(characterId);
    const label = img.label?.trim() ?? "";
    const id = newId();
    insertImage({
      id,
      character_id: characterId,
      asset_id: img.asset.id,
      label,
      view: img.view ?? (label ? inferView(label) : ""),
      is_primary: primary ? 1 : 0,
      position: count,
      created_at: nowIso(),
      created_by_type: actor.type,
      created_by_name: actor.name,
    });
    ids.push(id);
    count++;
  }
  return ids;
}

export interface CreateCharacterInput {
  name?: string;
  role?: string;
  appearance?: string;
  position?: number;
  sourceCharacterId?: string;
}

export function createCharacter(owner: Owner, input: CreateCharacterInput, actor: Actor, images: NewImage[] = []): Character {
  const db = getDb();
  assertOwner(owner);
  const source = input.sourceCharacterId ? characterRow(input.sourceCharacterId) : null;
  const name = input.name ?? source?.name;
  if (!name) throw badRequest("Nom du personnage requis (ou sourceCharacterId pour copier une fiche).");
  const now = nowIso();
  const siblings = ownerRows(owner).map((r) => r.id);
  const position = Math.min(input.position ?? siblings.length, siblings.length);
  const row: CharacterRow = {
    id: newId(),
    book_id: owner.bookId ?? null,
    series_id: owner.seriesId ?? null,
    position,
    name,
    role: input.role ?? source?.role ?? "",
    appearance: input.appearance ?? source?.appearance ?? "",
    created_at: now,
    updated_at: now,
    updated_by_type: actor.type,
    updated_by_name: actor.name,
    version: 1,
  };
  db.transaction(() => {
    insertCharacter(row);
    siblings.splice(position, 0, row.id);
    renumber(siblings);
    if (source) {
      // A copy owns its files: deleting the source's book must not take them away.
      for (const img of imageRows([source.id])) {
        const asset = copyAsset(getAsset(img.asset_id), { bookId: row.book_id, actor });
        insertImage({ ...img, id: newId(), character_id: row.id, asset_id: asset.id, created_at: now });
      }
    }
    const added = appendImages(row.id, images, actor);
    touchOwner(row, now);
    const labels = [source ? `personnage « ${name} » créé (copie de « ${source.name} »)` : `personnage « ${name} » créé`];
    if (added.length > 0) labels.push(`${added.length} image${added.length > 1 ? "s" : ""}`);
    record(row, actor, "character.create", labels, {
      details: added.map((id, i) => imageDetail(row.id, { id, asset_id: images[i]!.asset.id, label: images[i]!.label ?? "", view: images[i]!.view ?? "" }, images[i]!.asset)),
    });
  })();
  announce(row, actor);
  return getCharacter(row.id);
}

const LABELS: Record<string, string> = { name: "nom", role: "rôle", appearance: "apparence", position: "ordre" };

export function updateCharacter(id: string, patch: z.infer<typeof updateCharacterSchema>, actor: Actor): { character: Character; changed: string[] } {
  const db = getDb();
  const before = characterRow(id);
  const next: CharacterRow = {
    ...before,
    name: patch.name ?? before.name,
    role: patch.role ?? before.role,
    appearance: patch.appearance ?? before.appearance,
  };
  const changed = (["name", "role", "appearance"] as const).filter((k) => patch[k] !== undefined && patch[k] !== before[k]);
  const moving = patch.position !== undefined && patch.position !== before.position;
  if (changed.length === 0 && !moving) return { character: getCharacter(id), changed: [] };
  db.transaction(() => {
    const snap = snapshot(before);
    db.prepare("UPDATE characters SET name = ?, role = ?, appearance = ? WHERE id = ?").run(next.name, next.role, next.appearance, id);
    if (moving) {
      const ids = ownerRows(before.book_id ? { bookId: before.book_id } : { seriesId: before.series_id as string })
        .map((r) => r.id)
        .filter((x) => x !== id);
      ids.splice(Math.min(patch.position as number, ids.length), 0, id);
      renumber(ids);
    }
    touch(before, actor);
    const labels = [...changed, ...(moving ? (["position"] as const) : [])].map((k) => `${next.name} : ${LABELS[k]}`);
    record(before, actor, "character.update", labels, { snapshot: snap, coalesce: true });
  })();
  announce(before, actor);
  return { character: getCharacter(id), changed: [...changed, ...(moving ? ["position"] : [])] };
}

/**
 * New order of characters. For a book, its series' characters and its own are ordered
 * separately (series first); ids not given keep their order after the given ones.
 */
export function reorderCharacters(owner: Owner, order: string[], actor: Actor): Character[] {
  const db = getDb();
  assertOwner(owner);
  const groups: Owner[] = owner.bookId
    ? [...(seriesOfBook(owner.bookId) ? [{ seriesId: seriesOfBook(owner.bookId) as string }] : []), { bookId: owner.bookId }]
    : [owner];
  const known = new Set(groups.flatMap((g) => ownerRows(g).map((r) => r.id)));
  const unknown = order.filter((id) => !known.has(id));
  if (unknown.length > 0) throw badRequest(`Personnage(s) inconnu(s) ici : ${unknown.join(", ")}.`);
  db.transaction(() => {
    for (const g of groups) {
      const current = ownerRows(g).map((r) => r.id);
      const next = [...new Set([...order.filter((id) => current.includes(id)), ...current])];
      if (next.every((id, i) => id === current[i])) continue;
      renumber(next);
      const first = ownerRows(g)[0] as CharacterRow;
      touchOwner(first);
      recordActivity({ bookId: g.bookId ?? null, seriesId: g.seriesId ?? null, actor, action: "character.update", labels: ["ordre des personnages"], coalesce: true });
      announce(first, actor);
    }
  })();
  return owner.bookId ? listCharacters(owner.bookId) : listOwnerCharacters(owner);
}

export function deleteCharacter(id: string, actor: Actor): void {
  const db = getDb();
  const before = characterRow(id);
  const books = booksOf(before);
  const spreads = books.flatMap(
    (bookId) => db.prepare("SELECT id, character_ids FROM spreads WHERE book_id = ?").all(bookId) as { id: string; character_ids: string }[],
  );
  const present = spreads.filter((s) => parseIds(s.character_ids).includes(id));
  db.transaction(() => {
    const snap: CharacterSnapshot = { ...snapshot(before), spreadIds: present.map((s) => s.id) };
    // A derived clean-up, not an edit of the page: the spread's version does not move.
    const clean = db.prepare("UPDATE spreads SET character_ids = ? WHERE id = ?");
    for (const s of present) clean.run(JSON.stringify(parseIds(s.character_ids).filter((x) => x !== id)), s.id);
    db.prepare("DELETE FROM characters WHERE id = ?").run(id);
    if (before.book_id) db.prepare("UPDATE characters SET position = position - 1 WHERE book_id = ? AND position > ?").run(before.book_id, before.position);
    else db.prepare("UPDATE characters SET position = position - 1 WHERE series_id = ? AND position > ?").run(before.series_id, before.position);
    touchOwner(before);
    record(before, actor, "character.delete", [`personnage « ${before.name} » supprimé`], { snapshot: snap });
  })();
  for (const bookId of books) publish("book", bookId, actor);
}

/** Adds reference images to a character. Returns the character and the new image ids. */
export function addCharacterImages(id: string, images: NewImage[], actor: Actor): { character: Character; imageIds: string[] } {
  const db = getDb();
  const before = characterRow(id);
  let imageIds: string[] = [];
  db.transaction(() => {
    const snap = snapshot(before);
    imageIds = appendImages(id, images, actor);
    touch(before, actor);
    record(before, actor, "character.update", [`${before.name} : image${images.length > 1 ? "s" : ""} ajoutée${images.length > 1 ? "s" : ""}`], {
      snapshot: snap,
      coalesce: true,
      details: imageIds.map((imageId, i) =>
        imageDetail(id, { id: imageId, asset_id: images[i]!.asset.id, label: images[i]!.label ?? "", view: images[i]!.view ?? "" }, images[i]!.asset),
      ),
    });
  })();
  announce(before, actor);
  return { character: getCharacter(id), imageIds };
}

export function addCharacterImage(id: string, asset: AssetRow, input: z.infer<typeof characterImageSchema>, actor: Actor): Character {
  const { character, imageIds } = addCharacterImages(id, [{ asset, label: input.label, view: input.view, primary: input.primary }], actor);
  if (input.position !== undefined) return updateCharacterImage(id, imageIds[0] as string, { position: input.position }, actor).character;
  return character;
}

function imageRow(characterId: string, imageId: string): CharacterImageRow {
  const row = getDb().prepare("SELECT * FROM character_images WHERE id = ? AND character_id = ?").get(imageId, characterId) as
    | CharacterImageRow
    | undefined;
  if (!row) throw notFound("Image de référence");
  return row;
}

/** Promotes the first remaining image when the primary one goes away. */
function ensurePrimary(characterId: string): void {
  const db = getDb();
  if (db.prepare("SELECT 1 FROM character_images WHERE character_id = ? AND is_primary = 1").get(characterId)) return;
  db.prepare(
    "UPDATE character_images SET is_primary = 1 WHERE id = (SELECT id FROM character_images WHERE character_id = ? ORDER BY position, rowid LIMIT 1)",
  ).run(characterId);
}

export function updateCharacterImage(
  characterId: string,
  imageId: string,
  patch: z.infer<typeof characterImageSchema>,
  actor: Actor,
): { character: Character; changed: string[] } {
  const db = getDb();
  const before = characterRow(characterId);
  const image = imageRow(characterId, imageId);
  const changed: string[] = [];
  db.transaction(() => {
    const snap = snapshot(before);
    const labels: string[] = [];
    if (patch.label !== undefined && patch.label.trim() !== image.label) {
      db.prepare("UPDATE character_images SET label = ? WHERE id = ?").run(patch.label.trim(), imageId);
      // A label without an explicit view still says what the image shows.
      if (patch.view === undefined && !image.view) db.prepare("UPDATE character_images SET view = ? WHERE id = ?").run(inferView(patch.label), imageId);
      labels.push(`${before.name} : légende d'image`);
      changed.push("label");
    }
    if (patch.view !== undefined && patch.view !== viewOf(image)) {
      db.prepare("UPDATE character_images SET view = ? WHERE id = ?").run(patch.view, imageId);
      labels.push(`${before.name} : vue d'image`);
      changed.push("view");
    }
    if (patch.primary === true && image.is_primary !== 1) {
      db.prepare("UPDATE character_images SET is_primary = (id = ?) WHERE character_id = ?").run(imageId, characterId);
      labels.push(`${before.name} : image principale`);
      changed.push("primary");
    } else if (patch.primary === false && image.is_primary === 1) {
      db.prepare("UPDATE character_images SET is_primary = 0 WHERE id = ?").run(imageId);
      db.prepare(
        "UPDATE character_images SET is_primary = 1 WHERE id = (SELECT id FROM character_images WHERE character_id = ? AND id != ? ORDER BY position, rowid LIMIT 1)",
      ).run(characterId, imageId);
      ensurePrimary(characterId);
      labels.push(`${before.name} : image principale`);
      changed.push("primary");
    }
    if (patch.position !== undefined) {
      const ids = snap.images.map((i) => i.id);
      const from = ids.indexOf(imageId);
      const to = Math.min(patch.position, ids.length - 1);
      if (from !== to) {
        ids.splice(from, 1);
        ids.splice(to, 0, imageId);
        const stmt = db.prepare("UPDATE character_images SET position = ? WHERE id = ?");
        ids.forEach((x, i) => stmt.run(i, x));
        labels.push(`${before.name} : ordre des images`);
        changed.push("position");
      }
    }
    if (labels.length === 0) return;
    touch(before, actor);
    record(before, actor, "character.update", labels, {
      snapshot: snap,
      coalesce: true,
      details: [imageDetail(characterId, { ...image, label: patch.label ?? image.label, view: patch.view ?? image.view })],
    });
  })();
  if (changed.length > 0) announce(before, actor);
  return { character: getCharacter(characterId), changed };
}

export function removeCharacterImage(characterId: string, imageId: string, actor: Actor): Character {
  const db = getDb();
  const before = characterRow(characterId);
  const image = imageRow(characterId, imageId);
  db.transaction(() => {
    const snap = snapshot(before);
    db.prepare("DELETE FROM character_images WHERE id = ?").run(imageId);
    ensurePrimary(characterId);
    touch(before, actor);
    record(before, actor, "character.update", [`${before.name} : image retirée`], {
      snapshot: snap,
      coalesce: true,
      details: [imageDetail(characterId, image, undefined, true)],
    });
  })();
  announce(before, actor);
  return getCharacter(characterId);
}

/** Moves a book's own characters to its new series (create_series from a model book). */
export function moveCharactersToSeries(bookId: string, seriesId: string): number {
  const db = getDb();
  const own = ownerRows({ bookId }).map((r) => r.id);
  const start = ownerRows({ seriesId }).length;
  const stmt = db.prepare("UPDATE characters SET book_id = NULL, series_id = ?, position = ? WHERE id = ?");
  own.forEach((id, i) => stmt.run(seriesId, start + i, id));
  db.prepare(`UPDATE assets SET book_id = NULL WHERE id IN (SELECT asset_id FROM character_images WHERE character_id IN (${own.map(() => "?").join(",") || "''"}))`).run(
    ...own,
  );
  return own.length;
}

/** Copies a book's own characters into another book (clone_book_setup). */
export function copyCharacters(fromBookId: string, toBookId: string, actor: Actor): number {
  const rows = ownerRows({ bookId: fromBookId });
  for (const r of rows) createCharacter({ bookId: toBookId }, { sourceCharacterId: r.id }, actor);
  return rows.length;
}

/** Puts a character back as it was in a history snapshot (called by restoreActivity, in its transaction). */
export function restoreCharacterSnapshot(raw: unknown, when: string, actor: Actor): string[] {
  const db = getDb();
  const snap = raw as CharacterSnapshot;
  const saved: CharacterRow = { ...snap.character, series_id: snap.character.series_id ?? null };
  const id = saved.id;
  const existing = db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as CharacterRow | undefined;
  const now = nowIso();
  if (existing) {
    const current = snapshot(existing);
    db.prepare(
      "UPDATE characters SET name = ?, role = ?, appearance = ?, updated_at = ?, updated_by_type = ?, updated_by_name = ?, version = version + 1 WHERE id = ?",
    ).run(saved.name, saved.role, saved.appearance, now, actor.type, actor.name, id);
    db.prepare("DELETE FROM character_images WHERE character_id = ?").run(id);
    for (const image of snap.images) insertImage(image);
    record(existing, actor, "character.update", [`${saved.name} : restauré (version du ${when})`], { snapshot: current });
    touchOwner(existing, now);
    return booksOf(existing);
  }
  const owner: Owner = saved.book_id ? { bookId: saved.book_id } : { seriesId: saved.series_id as string };
  assertOwner(owner);
  const siblings = ownerRows(owner).map((r) => r.id);
  const position = Math.min(saved.position, siblings.length);
  insertCharacter({ ...saved, position, updated_at: now, updated_by_type: actor.type, updated_by_name: actor.name });
  siblings.splice(position, 0, id);
  renumber(siblings);
  for (const image of snap.images) insertImage(image);
  const read = db.prepare("SELECT character_ids FROM spreads WHERE id = ?");
  const write = db.prepare("UPDATE spreads SET character_ids = ? WHERE id = ?");
  for (const spreadId of snap.spreadIds ?? []) {
    const s = read.get(spreadId) as { character_ids: string } | undefined;
    if (s) write.run(JSON.stringify([...new Set([...parseIds(s.character_ids), id])]), spreadId);
  }
  record(saved, actor, "restore", [`personnage « ${saved.name} » rétabli`]);
  touchOwner(saved, now);
  return booksOf(saved);
}

// ---------------------------------------------------------------------------------------
// References for illustrating agents
// ---------------------------------------------------------------------------------------

function illustrationStyleOf(owner: Owner): { style: string; seriesId: string | null } {
  const db = getDb();
  if (owner.seriesId) {
    const s = db.prepare("SELECT illustration_style FROM series WHERE id = ?").get(owner.seriesId) as { illustration_style: string } | undefined;
    if (!s) throw notFound("Série");
    return { style: s.illustration_style.trim(), seriesId: owner.seriesId };
  }
  const b = db.prepare("SELECT series_id, illustration_style FROM books WHERE id = ?").get(owner.bookId) as
    | { series_id: string | null; illustration_style: string }
    | undefined;
  if (!b) throw notFound("Livre");
  const s = b.series_id
    ? (db.prepare("SELECT illustration_style FROM series WHERE id = ?").get(b.series_id) as { illustration_style: string } | undefined)
    : undefined;
  return { style: [s?.illustration_style ?? "", b.illustration_style].map((x) => x.trim()).filter(Boolean).join("\n\n"), seriesId: b.series_id };
}

/**
 * Who is on a page and what they look like, with the style of the series and the book and
 * temporary links an image generator can download. Without a spread: every character (or
 * the ones asked for). Images: primary first, then by view.
 */
export function characterReferences(
  owner: Owner,
  opts: { origin: string; spreadId?: string | null; characterIds?: string[]; views?: string[] },
): References {
  const db = getDb();
  const { style, seriesId } = illustrationStyleOf(owner);
  let characters = owner.bookId ? listCharacters(owner.bookId) : listOwnerCharacters(owner);
  let illustrationBrief: string | null = null;
  if (opts.spreadId) {
    if (!owner.bookId) throw badRequest("spread_id demande un livre (book_id).");
    const spread = db.prepare("SELECT character_ids, illustration_brief FROM spreads WHERE id = ? AND book_id = ?").get(opts.spreadId, owner.bookId) as
      | { character_ids: string; illustration_brief: string }
      | undefined;
    if (!spread) throw notFound("Double page");
    illustrationBrief = spread.illustration_brief;
    const present = parseIds(spread.character_ids);
    characters = present.map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => !!c);
  }
  if (opts.characterIds?.length) characters = characters.filter((c) => opts.characterIds?.includes(c.id));
  const wantView = (v: string) => !opts.views?.length || opts.views.some((w) => v === w || (w === "expression" && v.startsWith("expression:")));
  return {
    bookId: owner.bookId ?? "",
    seriesId,
    spreadId: opts.spreadId ?? null,
    illustrationStyle: style,
    illustrationBrief,
    expiresAt: new Date(Date.now() + SIGNED_TTL_SECONDS * 1000).toISOString(),
    characters: characters.map((c): CharacterReference => {
      const images = c.images
        .filter((i) => wantView(i.view))
        .sort((a, b) => Number(b.primary) - Number(a.primary) || viewRank(a.view) - viewRank(b.view) || a.position - b.position)
        .map((i) => ({
          id: i.id,
          label: i.label,
          view: i.view,
          primary: i.primary,
          width: i.image.width,
          height: i.image.height,
          url: `${opts.origin}${i.image.printUrl}`,
          signedUrl: signedAssetUrl(opts.origin, i.image.id, "print"),
          signedWebUrl: signedAssetUrl(opts.origin, i.image.id, "web"),
        }));
      const byView: Record<string, string[]> = {};
      for (const i of [...images].sort((a, b) => viewRank(a.view) - viewRank(b.view))) (byView[i.view] ??= []).push(i.id);
      return { id: c.id, seriesId: c.seriesId, name: c.name, role: c.role, appearance: c.appearance, images, byView };
    }),
  };
}

/** Asset id of a character image (view_illustration, get_references inline images). */
export function characterImageAsset(imageId: string): string {
  const row = getDb().prepare("SELECT asset_id FROM character_images WHERE id = ?").get(imageId) as { asset_id: string } | undefined;
  if (!row) throw notFound("Image de référence");
  return row.asset_id;
}
