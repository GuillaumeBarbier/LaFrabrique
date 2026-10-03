import fs from "node:fs";
import path from "node:path";
import { CUSTOM_FONT_PREFIX, customFontCssFamily, findCatalogFont, isCustomFontKey } from "@/lib/fonts";
import type { CustomFont } from "@/lib/types";
import { assetDir, deleteAssetFiles, insertAsset, MAX_FONT_BYTES } from "../assets";
import { getDb } from "../db";
import type { Actor } from "../http";
import { badRequest, HttpError, newId, notFound, nowIso, sha256 } from "../util";

// Custom fonts (ADR-0004): checked by their binary signature, stored next to the assets.

const SIGNATURES: { format: string; ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  { format: "woff2", ext: "woff2", mime: "font/woff2", test: (b) => b.subarray(0, 4).toString("latin1") === "wOF2" },
  { format: "woff", ext: "woff", mime: "font/woff", test: (b) => b.subarray(0, 4).toString("latin1") === "wOFF" },
  { format: "opentype", ext: "otf", mime: "font/otf", test: (b) => b.subarray(0, 4).toString("latin1") === "OTTO" },
  {
    format: "truetype",
    ext: "ttf",
    mime: "font/ttf",
    test: (b) => b.readUInt32BE(0) === 0x00010000 || b.subarray(0, 4).toString("latin1") === "true",
  },
];

export function detectFontFormat(buffer: Buffer): (typeof SIGNATURES)[number] | null {
  if (buffer.length < 12) return null;
  return SIGNATURES.find((s) => s.test(buffer)) ?? null;
}

interface FontRow {
  id: string;
  name: string;
  asset_id: string;
  format: string;
  created_at: string;
}

function toFont(row: FontRow): CustomFont {
  return {
    id: row.id,
    key: `${CUSTOM_FONT_PREFIX}${row.id}`,
    name: row.name,
    format: row.format,
    url: `/api/v1/fonts/${row.id}/file`,
    createdAt: row.created_at,
  };
}

export function listCustomFonts(): CustomFont[] {
  return (getDb().prepare("SELECT * FROM fonts ORDER BY name COLLATE NOCASE").all() as FontRow[]).map(toFont);
}

function getFontRow(id: string): FontRow {
  const row = getDb().prepare("SELECT * FROM fonts WHERE id = ?").get(id) as FontRow | undefined;
  if (!row) throw notFound("Police");
  return row;
}

export function fontKeyExists(key: string): boolean {
  if (isCustomFontKey(key)) {
    return getDb().prepare("SELECT 1 FROM fonts WHERE id = ?").get(key.slice(CUSTOM_FONT_PREFIX.length)) !== undefined;
  }
  return findCatalogFont(key) !== undefined;
}

export function cleanFontName(fileName: string): string {
  const base = fileName.replace(/\.(ttf|otf|woff2?)$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return (base || "Police personnelle").slice(0, 60);
}

export function uploadFont(buffer: Buffer, fileName: string, displayName: string | null, actor: Actor): CustomFont {
  if (buffer.length > MAX_FONT_BYTES) throw new HttpError(413, "too_large", "Police trop lourde (10 Mo au plus).");
  const kind = detectFontFormat(buffer);
  if (!kind) throw badRequest("Ce fichier n'est pas une police TTF, OTF, WOFF ou WOFF2.");
  const assetId = newId();
  const dir = assetDir(assetId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `original.${kind.ext}`), buffer);
  const now = nowIso();
  insertAsset({
    id: assetId,
    kind: "font",
    book_id: null,
    original_name: fileName.slice(0, 200),
    mime: kind.mime,
    ext: kind.ext,
    size: buffer.length,
    width: null,
    height: null,
    sha256: sha256(buffer),
    created_at: now,
    created_by_type: actor.type,
    created_by_name: actor.name,
  });
  const row: FontRow = {
    id: newId(),
    name: (displayName?.trim() || cleanFontName(fileName)).slice(0, 60),
    asset_id: assetId,
    format: kind.format,
    created_at: now,
  };
  getDb().prepare("INSERT INTO fonts (id, name, asset_id, format, created_at) VALUES (@id, @name, @asset_id, @format, @created_at)").run(row);
  return toFont(row);
}

export function renameFont(id: string, name: string): CustomFont {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw badRequest("Nom vide.");
  getFontRow(id);
  getDb().prepare("UPDATE fonts SET name = ? WHERE id = ?").run(clean, id);
  return toFont(getFontRow(id));
}

/** Refuses to delete a font a book still uses: the book would silently change. */
export function deleteFont(id: string): void {
  const row = getFontRow(id);
  const key = `${CUSTOM_FONT_PREFIX}${id}`;
  const users = getDb()
    .prepare(
      "SELECT title FROM books WHERE json_extract(typography, '$.titleFont') = ? OR json_extract(typography, '$.bodyFont') = ?",
    )
    .all(key, key) as { title: string }[];
  if (users.length > 0) {
    throw new HttpError(409, "font_in_use", `Police utilisée par : ${users.map((u) => `« ${u.title} »`).join(", ")}.`);
  }
  getDb().transaction(() => {
    getDb().prepare("DELETE FROM fonts WHERE id = ?").run(id);
    getDb().prepare("DELETE FROM assets WHERE id = ?").run(row.asset_id);
  })();
  deleteAssetFiles([row.asset_id]);
}

export function fontFile(id: string): { file: string; mime: string } {
  const row = getFontRow(id);
  const asset = getDb().prepare("SELECT ext, mime FROM assets WHERE id = ?").get(row.asset_id) as { ext: string; mime: string };
  return { file: path.join(assetDir(row.asset_id), `original.${asset.ext}`), mime: asset.mime };
}

/** @font-face rules for every custom font, served as one stylesheet. */
export function customFontsCss(): string {
  return listCustomFonts()
    .map(
      (f) =>
        `@font-face { font-family: "${customFontCssFamily(f.id)}"; src: url("${f.url}") format("${f.format}"); font-display: swap; }`,
    )
    .join("\n");
}
