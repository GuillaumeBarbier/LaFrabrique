import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { dataDir, getDb } from "./db";
import type { Actor } from "./http";
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
  input: { kind: "illustration" | "cover" | "character"; bookId: string; originalName?: string | null; actor: Actor },
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
    if (typeof body.base64 === "string") return { buffer: decodeBase64(body.base64), name, fields };
    if (typeof body.url === "string") {
      return { buffer: await fetchImage(body.url), name: name ?? body.url.split("/").pop() ?? null, fields };
    }
    throw badRequest("JSON attendu : { base64 } ou { url }.");
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

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:|\[?fe80:)/i;

/** Downloads an image an agent points to. Public https only: no reaching into the LAN. */
export async function fetchImage(url: string): Promise<Buffer> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw badRequest("Adresse d'image invalide.");
  }
  if (parsed.protocol !== "https:" || PRIVATE_HOST.test(parsed.hostname)) {
    throw badRequest("Seules les adresses https publiques sont acceptées.");
  }
  // The name could still resolve to a private address: check what it points to.
  const addresses = await dns.lookup(parsed.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw badRequest("Seules les adresses https publiques sont acceptées.");
  }
  const res = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw badRequest(`Téléchargement impossible (${res.status}).`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES) throw new HttpError(413, "too_large", "Image trop lourde (40 Mo au plus).");
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) throw new HttpError(413, "too_large", "Image trop lourde (40 Mo au plus).");
  return buffer;
}

export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) return PRIVATE_HOST.test(address);
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  return lower === "::1" || lower === "::" || /^f[cd]/.test(lower) || lower.startsWith("fe80");
}
