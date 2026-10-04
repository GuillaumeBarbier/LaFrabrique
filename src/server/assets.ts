import fs from "node:fs";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { dataDir, getDb } from "./db";
import type { Actor } from "./http";
import { fetchPublic } from "./net";
import { badRequest, HttpError, newId, notFound, nowIso, sha256 } from "./util";

export type AssetKind = "illustration" | "cover" | "font" | "character";
export type AssetSize = "original" | "print" | "web" | "thumb";

export interface AssetRow {
  id: string;
  kind: AssetKind;
  book_id: string | null;
  original_name: string | null;
  mime: string;
  ext: string;
  size: number;
  width: number | null;
  height: number | null;
  sha256: string;
  created_at: string;
  created_by_type: string;
  created_by_name: string;
}

export const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
export const MAX_FONT_BYTES = 10 * 1024 * 1024;

const IMAGE_FORMATS: Record<string, { mime: string; ext: string }> = {
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
  webp: { mime: "image/webp", ext: "webp" },
  avif: { mime: "image/avif", ext: "avif" },
  gif: { mime: "image/gif", ext: "gif" },
  tiff: { mime: "image/tiff", ext: "tif" },
};

export function assetDir(id: string): string {
  if (!/^[0-9a-z]+$/.test(id)) throw notFound("Fichier");
  return path.join(dataDir(), "assets", id);
}

export function getAsset(id: string): AssetRow {
  const row = getDb().prepare("SELECT * FROM assets WHERE id = ?").get(id) as AssetRow | undefined;
  if (!row) throw notFound("Fichier");
  return row;
}

export function assetFilePath(asset: AssetRow, size: AssetSize): { file: string; mime: string } {
  const dir = assetDir(asset.id);
  if (size === "original" || asset.kind === "font") return { file: path.join(dir, `original.${asset.ext}`), mime: asset.mime };
  // Browsers cannot show TIFF: print uses a full-resolution JPEG made at upload.
  if (size === "print") {
    return asset.ext === "tif"
      ? { file: path.join(dir, "print.jpg"), mime: "image/jpeg" }
      : { file: path.join(dir, `original.${asset.ext}`), mime: asset.mime };
  }
  return { file: path.join(dir, `${size}.webp`), mime: "image/webp" };
}

/**
 * Stores an illustration or a cover: the original (for print) plus a screen version and a
 * thumbnail in WebP. SVG is refused: served from our origin it could carry scripts.
 */
export async function storeImage(
  buffer: Buffer,
  input: { kind: "illustration" | "cover" | "character"; bookId: string | null; originalName?: string | null; actor: Pick<Actor, "type" | "name"> },
): Promise<AssetRow> {
  if (buffer.length === 0) throw badRequest("Fichier vide.");
  if (buffer.length > MAX_IMAGE_BYTES) throw new HttpError(413, "too_large", "Image trop lourde (40 Mo au plus).");
  let meta: Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw badRequest("Ce fichier n'est pas une image lisible.");
  }
  const format = meta.format ? IMAGE_FORMATS[meta.format] : undefined;
  if (!format) throw badRequest("Format refusé : JPEG, PNG, WebP, AVIF, GIF ou TIFF.");
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = (rotated ? meta.height : meta.width) ?? null;
  const height = (rotated ? meta.width : meta.height) ?? null;

  const id = newId();
  const dir = assetDir(id);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(path.join(dir, `original.${format.ext}`), buffer);
    await sharp(buffer).rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(dir, "web.webp"));
    if (format.ext === "tif") await sharp(buffer).rotate().jpeg({ quality: 92 }).toFile(path.join(dir, "print.jpg"));
    await sharp(buffer).rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 74 }).toFile(path.join(dir, "thumb.webp"));
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }

  const row: AssetRow = {
    id,
    kind: input.kind,
    book_id: input.bookId,
    original_name: input.originalName?.slice(0, 200) ?? null,
    mime: format.mime,
    ext: format.ext,
    size: buffer.length,
    width,
    height,
    sha256: sha256(buffer),
    created_at: nowIso(),
    created_by_type: input.actor.type,
    created_by_name: input.actor.name,
  };
  insertAsset(row);
  return row;
}

export function insertAsset(row: AssetRow): void {
  getDb()
    .prepare(
      `INSERT INTO assets (id, kind, book_id, original_name, mime, ext, size, width, height, sha256, created_at, created_by_type, created_by_name)
       VALUES (@id, @kind, @book_id, @original_name, @mime, @ext, @size, @width, @height, @sha256, @created_at, @created_by_type, @created_by_name)`,
    )
    .run(row);
}

/** A copy of an image under a new id (a cloned book or character owns its files). */
export function copyAsset(asset: AssetRow, input: { bookId: string | null; actor: Pick<Actor, "type" | "name"> }): AssetRow {
  const id = newId();
  const from = assetDir(asset.id);
  const to = assetDir(id);
  fs.mkdirSync(to, { recursive: true });
  for (const file of fs.readdirSync(from)) fs.copyFileSync(path.join(from, file), path.join(to, file), fs.constants.COPYFILE_FICLONE);
  const row: AssetRow = {
    ...asset,
    id,
    book_id: input.bookId,
    created_at: nowIso(),
    created_by_type: input.actor.type,
    created_by_name: input.actor.name,
  };
  insertAsset(row);
  return row;
}

export function deleteAssetFiles(ids: string[]): void {
  for (const id of ids) fs.rmSync(assetDir(id), { recursive: true, force: true });
}

export interface ImageUpload {
  buffer: Buffer;
  name: string | null;
  /** Other text fields of the form or the JSON body (e.g. a reference's label). */
  fields: Record<string, string | boolean>;
}

/** Image bytes from an upload: multipart `file`, or JSON `{ base64 }` / `{ url }` (agents). */
export async function readImageUpload(req: Request): Promise<ImageUpload> {
  const input = await readImageInput(req);
  if ("uploadId" in input) throw badRequest("uploadId n'est pas accepté ici.");
  return input;
}

/** Like readImageUpload, or JSON `{ uploadId }`: a file already sent to a signed upload URL. */
export async function readImageInput(req: Request): Promise<ImageUpload | { uploadId: string; fields: Record<string, string | boolean> }> {
  const type = req.headers.get("content-type") ?? "";
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES * 1.4) throw new HttpError(413, "too_large", "Image trop lourde (40 Mo au plus).");
  if (type.startsWith("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw badRequest("Champ « file » manquant.");
    const fields: Record<string, string> = {};
    for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
    return { buffer: Buffer.from(await file.arrayBuffer()), name: file.name || null, fields };
  }
  if (type.startsWith("application/json")) {
    const body = (await req.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name : null;
    const fields: Record<string, string | boolean> = {};
    for (const [k, v] of Object.entries(body)) if ((typeof v === "string" || typeof v === "boolean") && k !== "base64") fields[k] = v;
    if (typeof body.uploadId === "string") return { uploadId: body.uploadId, fields };
    if (typeof body.base64 === "string") return { buffer: decodeBase64(body.base64), name, fields };
    if (typeof body.url === "string") {
      return { buffer: await fetchImage(body.url), name: name ?? body.url.split("/").pop() ?? null, fields };
    }
    throw badRequest("JSON attendu : { uploadId }, { base64 } ou { url }.");
  }
  if (type.startsWith("image/")) return { buffer: Buffer.from(await req.arrayBuffer()), name: null, fields: {} };
  throw badRequest("Envoyer un fichier (multipart « file »), une image brute, ou du JSON { base64 | url }.");
}

export function decodeBase64(value: string): Buffer {
  const clean = value.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  const buffer = Buffer.from(clean, "base64");
  if (buffer.length === 0) throw badRequest("base64 vide ou invalide.");
  return buffer;
}

/** Downloads an image an agent points to. Public https only: no reaching into the LAN. */
export async function fetchImage(url: string): Promise<Buffer> {
  try {
    return await fetchPublic(url, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 20_000, what: "Adresse d'image" });
  } catch (err) {
    if (err instanceof HttpError && err.status === 413) throw new HttpError(413, "too_large", "Image trop lourde (40 Mo au plus).");
    throw err;
  }
}

/** Form or JSON fields of a reference image upload, typed for characterImageSchema. */
export function imageFields(fields: Record<string, string | boolean>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof fields.label === "string") out.label = fields.label;
  if (typeof fields.view === "string" && fields.view) out.view = fields.view;
  if (fields.primary === true || fields.primary === "true") out.primary = true;
  if (typeof fields.position === "string" && /^\d+$/.test(fields.position)) out.position = Number(fields.position);
  return out;
}
