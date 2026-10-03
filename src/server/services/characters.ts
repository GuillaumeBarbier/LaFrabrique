import { z } from "zod";
import type { Character, CharacterImage, References } from "@/lib/types";
import type { AssetRow } from "../assets";
import { getDb } from "../db";
import { publish } from "../events";
import type { Actor } from "../http";
import { SIGNED_TTL_SECONDS, signedAssetUrl } from "../signing";
import { badRequest, newId, notFound, nowIso } from "../util";
import { recordActivity } from "./activity";
import { loadAssetRefs, parseIds } from "./rows";

// Characters of a book (F2.1, ADR-0006): a sheet (name, role, appearance in words) and
// reference images, so that every illustration of the book draws them the same way.

export const createCharacterSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    role: z.string().max(500).optional(),
    appearance: z.string().max(5_000).optional(),
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

export const characterImageSchema = z
  .object({
    label: z.string().max(80),
    primary: z.boolean(),
  })
  .partial()
  .strict();

export interface CharacterRow {
  id: string;
  book_id: string;
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

// ---------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------

function characterRow(bookId: string, id: string): CharacterRow {
  const row = getDb().prepare("SELECT * FROM characters WHERE id = ? AND book_id = ?").get(id, bookId) as CharacterRow | undefined;
  if (!row) throw notFound("Personnage");
  return row;
}

function imageRows(characterIds: string[]): CharacterImageRow[] {
  if (characterIds.length === 0) return [];
  return getDb()
    .prepare(
      `SELECT * FROM character_images WHERE character_id IN (${characterIds.map(() => "?").join(",")}) ORDER BY is_primary DESC, position`,
    )
    .all(...characterIds) as CharacterImageRow[];
}

function snapshot(row: CharacterRow): CharacterSnapshot {
  return { character: row, images: imageRows([row.id]) };
}

export function listCharacters(bookId: string): Character[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM characters WHERE book_id = ? ORDER BY position").all(bookId) as CharacterRow[];
  const images = imageRows(rows.map((r) => r.id));
  const assets = loadAssetRefs(db, images.map((i) => i.asset_id));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    appearance: r.appearance,
    position: r.position,
    images: images
      .filter((i) => i.character_id === r.id)
      .flatMap((i): CharacterImage[] => {
        const image = assets.get(i.asset_id);
        return image
          ? [
              {
                id: i.id,
                label: i.label,
                primary: i.is_primary === 1,
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

export function getCharacter(bookId: string, id: string): Character {
  characterRow(bookId, id);
  return listCharacters(bookId).find((c) => c.id === id) as Character;
}

/** Keeps only ids of this book's characters, without duplicates, in the given order. */
export function validCharacterIds(bookId: string, ids: string[]): string[] {
  const known = new Set(
    (getDb().prepare("SELECT id FROM characters WHERE book_id = ?").all(bookId) as { id: string }[]).map((r) => r.id),
  );
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) throw badRequest(`Personnage(s) inconnu(s) dans ce livre : ${unknown.join(", ")}.`);
  return [...new Set(ids)];
}

// ---------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------

function touch(row: CharacterRow, actor: Actor): void {
  const now = nowIso();
  getDb()
    .prepare("UPDATE characters SET updated_at = ?, updated_by_type = ?, updated_by_name = ?, version = version + 1 WHERE id = ?")
    .run(now, actor.type, actor.name, row.id);
  getDb().prepare("UPDATE books SET updated_at = ? WHERE id = ?").run(now, row.book_id);
}

function insertCharacter(row: CharacterRow): void {
  getDb()
    .prepare(
      `INSERT INTO characters (id, book_id, position, name, role, appearance, created_at, updated_at, updated_by_type, updated_by_name, version)
       VALUES (@id, @book_id, @position, @name, @role, @appearance, @created_at, @updated_at, @updated_by_type, @updated_by_name, @version)`,
    )
    .run(row);
}

function insertImage(row: CharacterImageRow): void {
  getDb()
    .prepare(
      `INSERT INTO character_images (id, character_id, asset_id, label, is_primary, position, created_at, created_by_type, created_by_name)
       VALUES (@id, @character_id, @asset_id, @label, @is_primary, @position, @created_at, @created_by_type, @created_by_name)`,
    )
    .run(row);
}

export function createCharacter(bookId: string, input: z.infer<typeof createCharacterSchema>, actor: Actor): Character {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM books WHERE id = ?").get(bookId)) throw notFound("Livre");
  const now = nowIso();
  const count = (db.prepare("SELECT COUNT(*) n FROM characters WHERE book_id = ?").get(bookId) as { n: number }).n;
  const row: CharacterRow = {
    id: newId(),
    book_id: bookId,
    position: count,
    name: input.name,
    role: input.role ?? "",
    appearance: input.appearance ?? "",
    created_at: now,
    updated_at: now,
    updated_by_type: actor.type,
    updated_by_name: actor.name,
    version: 1,
  };
  db.transaction(() => {
    insertCharacter(row);
    db.prepare("UPDATE books SET updated_at = ? WHERE id = ?").run(now, bookId);
    recordActivity({ bookId, characterId: row.id, actor, action: "character.create", labels: [`personnage « ${row.name} » créé`] });
  })();
  publish("book", bookId, actor);
  return getCharacter(bookId, row.id);
}

const LABELS: Record<string, string> = { name: "nom", role: "rôle", appearance: "apparence", position: "ordre" };

export function updateCharacter(bookId: string, id: string, patch: z.infer<typeof updateCharacterSchema>, actor: Actor): Character {
  const db = getDb();
  const before = characterRow(bookId, id);
  const next: CharacterRow = {
    ...before,
    name: patch.name ?? before.name,
    role: patch.role ?? before.role,
    appearance: patch.appearance ?? before.appearance,
  };
  const labels = (Object.keys(patch) as (keyof typeof patch)[])
    .filter((k) => k !== "position" && patch[k] !== undefined && patch[k] !== before[k as "name" | "role" | "appearance"])
    .map((k) => LABELS[k] as string);
  const moving = patch.position !== undefined && patch.position !== before.position;
  if (labels.length === 0 && !moving) return getCharacter(bookId, id);
  db.transaction(() => {
    const snap = snapshot(before);
    db.prepare("UPDATE characters SET name = ?, role = ?, appearance = ? WHERE id = ?").run(next.name, next.role, next.appearance, id);
    if (moving) {
      const ids = (db.prepare("SELECT id FROM characters WHERE book_id = ? ORDER BY position").all(bookId) as { id: string }[])
        .map((r) => r.id)
        .filter((x) => x !== id);
      ids.splice(Math.min(patch.position as number, ids.length), 0, id);
      const stmt = db.prepare("UPDATE characters SET position = ? WHERE id = ?");
      ids.forEach((x, i) => stmt.run(i, x));
      labels.push(LABELS.position as string);
    }
    touch(before, actor);
    recordActivity({
      bookId,
      characterId: id,
      actor,
      action: "character.update",
      labels: labels.map((l) => `${next.name} : ${l}`),
      snapshot: snap,
      coalesce: true,
    });
  })();
  publish("book", bookId, actor);
  return getCharacter(bookId, id);
}

export function deleteCharacter(bookId: string, id: string, actor: Actor): void {
  const db = getDb();
  const before = characterRow(bookId, id);
  const spreads = db.prepare("SELECT id, character_ids FROM spreads WHERE book_id = ?").all(bookId) as { id: string; character_ids: string }[];
  const present = spreads.filter((s) => parseIds(s.character_ids).includes(id));
  db.transaction(() => {
    const snap: CharacterSnapshot = { ...snapshot(before), spreadIds: present.map((s) => s.id) };
    // A derived clean-up, not an edit of the page: the spread's version does not move.
    const clean = db.prepare("UPDATE spreads SET character_ids = ? WHERE id = ?");
    for (const s of present) clean.run(JSON.stringify(parseIds(s.character_ids).filter((x) => x !== id)), s.id);
    db.prepare("DELETE FROM characters WHERE id = ?").run(id);
    db.prepare("UPDATE characters SET position = position - 1 WHERE book_id = ? AND position > ?").run(bookId, before.position);
    db.prepare("UPDATE books SET updated_at = ? WHERE id = ?").run(nowIso(), bookId);
    recordActivity({ bookId, characterId: id, actor, action: "character.delete", labels: [`personnage « ${before.name} » supprimé`], snapshot: snap });
  })();
  publish("book", bookId, actor);
}

export function addCharacterImage(
  bookId: string,
  characterId: string,
  asset: AssetRow,
  input: z.infer<typeof characterImageSchema>,
  actor: Actor,
): Character {
  const db = getDb();
  const before = characterRow(bookId, characterId);
  db.transaction(() => {
    const snap = snapshot(before);
    const count = snap.images.length;
    const primary = input.primary === true || count === 0;
    if (primary) db.prepare("UPDATE character_images SET is_primary = 0 WHERE character_id = ?").run(characterId);
    insertImage({
      id: newId(),
      character_id: characterId,
      asset_id: asset.id,
      label: input.label?.trim() ?? "",
      is_primary: primary ? 1 : 0,
      position: count,
      created_at: nowIso(),
      created_by_type: actor.type,
      created_by_name: actor.name,
    });
    touch(before, actor);
    recordActivity({
      bookId,
      characterId,
      actor,
      action: "character.update",
      labels: [`${before.name} : image ajoutée`],
      snapshot: snap,
      coalesce: true,
    });
  })();
  publish("book", bookId, actor);
  return getCharacter(bookId, characterId);
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
    "UPDATE character_images SET is_primary = 1 WHERE id = (SELECT id FROM character_images WHERE character_id = ? ORDER BY position LIMIT 1)",
  ).run(characterId);
}

export function updateCharacterImage(
  bookId: string,
  characterId: string,
  imageId: string,
  patch: z.infer<typeof characterImageSchema>,
  actor: Actor,
): Character {
  const db = getDb();
  const before = characterRow(bookId, characterId);
  const image = imageRow(characterId, imageId);
  db.transaction(() => {
    const snap = snapshot(before);
    const labels: string[] = [];
    if (patch.label !== undefined && patch.label.trim() !== image.label) {
      db.prepare("UPDATE character_images SET label = ? WHERE id = ?").run(patch.label.trim(), imageId);
      labels.push(`${before.name} : légende d'image`);
    }
    if (patch.primary === true && image.is_primary !== 1) {
      db.prepare("UPDATE character_images SET is_primary = (id = ?) WHERE character_id = ?").run(imageId, characterId);
      labels.push(`${before.name} : image principale`);
    } else if (patch.primary === false && image.is_primary === 1) {
      db.prepare("UPDATE character_images SET is_primary = 0 WHERE id = ?").run(imageId);
      db.prepare(
        "UPDATE character_images SET is_primary = 1 WHERE id = (SELECT id FROM character_images WHERE character_id = ? AND id != ? ORDER BY position LIMIT 1)",
      ).run(characterId, imageId);
      ensurePrimary(characterId);
      labels.push(`${before.name} : image principale`);
    }
    if (labels.length === 0) return;
    touch(before, actor);
    recordActivity({ bookId, characterId, actor, action: "character.update", labels, snapshot: snap, coalesce: true });
  })();
  publish("book", bookId, actor);
  return getCharacter(bookId, characterId);
}

export function removeCharacterImage(bookId: string, characterId: string, imageId: string, actor: Actor): Character {
  const db = getDb();
  const before = characterRow(bookId, characterId);
  imageRow(characterId, imageId);
  db.transaction(() => {
    const snap = snapshot(before);
    db.prepare("DELETE FROM character_images WHERE id = ?").run(imageId);
    ensurePrimary(characterId);
    touch(before, actor);
    recordActivity({
      bookId,
      characterId,
      actor,
      action: "character.update",
      labels: [`${before.name} : image retirée`],
      snapshot: snap,
      coalesce: true,
    });
  })();
  publish("book", bookId, actor);
  return getCharacter(bookId, characterId);
}

/** Puts a character back as it was in a history snapshot (called by restoreActivity, in its transaction). */
export function restoreCharacterSnapshot(bookId: string, raw: unknown, when: string, actor: Actor): void {
  const db = getDb();
  const snap = raw as CharacterSnapshot;
  const id = snap.character.id;
  const existing = db.prepare("SELECT * FROM characters WHERE id = ? AND book_id = ?").get(id, bookId) as CharacterRow | undefined;
  const now = nowIso();
  if (existing) {
    const current = snapshot(existing);
    db.prepare(
      "UPDATE characters SET name = ?, role = ?, appearance = ?, updated_at = ?, updated_by_type = ?, updated_by_name = ?, version = version + 1 WHERE id = ?",
    ).run(snap.character.name, snap.character.role, snap.character.appearance, now, actor.type, actor.name, id);
    db.prepare("DELETE FROM character_images WHERE character_id = ?").run(id);
    for (const image of snap.images) insertImage(image);
    recordActivity({
      bookId,
      characterId: id,
      actor,
      action: "character.update",
      labels: [`${snap.character.name} : restauré (version du ${when})`],
      snapshot: current,
    });
  } else {
    const count = (db.prepare("SELECT COUNT(*) n FROM characters WHERE book_id = ?").get(bookId) as { n: number }).n;
    const position = Math.min(snap.character.position, count);
    db.prepare("UPDATE characters SET position = position + 1 WHERE book_id = ? AND position >= ?").run(bookId, position);
    insertCharacter({ ...snap.character, book_id: bookId, position, updated_at: now, updated_by_type: actor.type, updated_by_name: actor.name });
    for (const image of snap.images) insertImage(image);
    const add = db.prepare("SELECT character_ids FROM spreads WHERE id = ? AND book_id = ?");
    const write = db.prepare("UPDATE spreads SET character_ids = ? WHERE id = ?");
    for (const spreadId of snap.spreadIds ?? []) {
      const s = add.get(spreadId, bookId) as { character_ids: string } | undefined;
      if (s) write.run(JSON.stringify([...new Set([...parseIds(s.character_ids), id])]), spreadId);
    }
    recordActivity({ bookId, characterId: id, actor, action: "restore", labels: [`personnage « ${snap.character.name} » rétabli`] });
  }
}

// ---------------------------------------------------------------------------------------
// References for illustrating agents
// ---------------------------------------------------------------------------------------

/**
 * Who is on a page and what they look like, with temporary links an image generator can
 * download. Without a spread: every character (or the ones asked for).
 */
export function characterReferences(
  bookId: string,
  opts: { origin: string; spreadId?: string | null; characterIds?: string[] },
): References {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM books WHERE id = ?").get(bookId)) throw notFound("Livre");
  let characters = listCharacters(bookId);
  let illustrationBrief: string | null = null;
  if (opts.spreadId) {
    const spread = db.prepare("SELECT character_ids, illustration_brief FROM spreads WHERE id = ? AND book_id = ?").get(opts.spreadId, bookId) as
      | { character_ids: string; illustration_brief: string }
      | undefined;
    if (!spread) throw notFound("Double page");
    illustrationBrief = spread.illustration_brief;
    const present = parseIds(spread.character_ids);
    characters = present.map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => !!c);
  }
  if (opts.characterIds?.length) characters = characters.filter((c) => opts.characterIds?.includes(c.id));
  return {
    bookId,
    spreadId: opts.spreadId ?? null,
    illustrationBrief,
    expiresAt: new Date(Date.now() + SIGNED_TTL_SECONDS * 1000).toISOString(),
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      appearance: c.appearance,
      images: c.images.map((i) => ({
        id: i.id,
        label: i.label,
        primary: i.primary,
        width: i.image.width,
        height: i.image.height,
        url: `${opts.origin}${i.image.printUrl}`,
        signedUrl: signedAssetUrl(opts.origin, i.image.id, "print"),
        signedWebUrl: signedAssetUrl(opts.origin, i.image.id, "web"),
      })),
    })),
  };
}
