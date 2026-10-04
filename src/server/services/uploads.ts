import crypto from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { getFormat, PRINT_DPI, requiredPixels } from "@/lib/book";
import type { UploadKind, UploadResult, UploadTicket, UploadWarning } from "@/lib/types";
import { deleteAssetFiles, getAsset, MAX_IMAGE_BYTES, storeImage, type AssetRow } from "../assets";
import { getDb } from "../db";
import type { Actor } from "../http";
import { badRequest, HttpError, newId, notFound, nowIso, sha256 } from "../util";
import { getSpread, imageDpi, setCover, setIllustration } from "./books";
import { addCharacterImages, characterOfBook, characterRow, createCharacter, seriesOfBook, type CreateCharacterInput, type Owner } from "./characters";
import { imageView } from "./schemas";

// Direct uploads (ADR-0008). An agent whose images are local files (a sandbox, a script) asks
// for a single-use signed URL, sends the file with `curl -T`, then commits it to its target.
// No base64 in a tool call, no browser. The file is processed on receipt (dimensions, dpi,
// screen versions) and attributed to whoever asked for the URL.

export const UPLOAD_KINDS = ["spread_illustration", "cover", "character_image", "image"] as const;
/** Time to send the file. */
export const UPLOAD_TTL_MS = 15 * 60_000;
/** Time to commit (or reuse) a received file before it is cleaned up. */
export const UPLOAD_KEEP_MS = 24 * 3600_000;
export const MAX_FILES = 50;

const item = {
  kind: z.enum(UPLOAD_KINDS),
  /** Spread (spread_illustration) or character (character_image). */
  targetId: z.string().max(40),
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().max(100),
  /** For character images: what the image shows, its view, primary or not. */
  label: z.string().max(80),
  view: imageView,
  primary: z.boolean(),
};

export const createUploadsSchema = z
  .object({
    bookId: z.string().max(40),
    seriesId: z.string().max(40),
    ...item,
    /** Attach as soon as the file arrives (no commit call). */
    autoCommit: z.boolean(),
    /** Several files at once; each inherits the fields above unless it sets its own. */
    files: z.array(z.object(item).partial().required({ filename: true }).strict()).min(1).max(MAX_FILES),
  })
  .partial()
  .strict();

export const commitUploadsSchema = z.object({ uploadIds: z.array(z.string().max(40)).min(1).max(MAX_FILES) }).strict();

interface UploadRow {
  id: string;
  token_hash: string;
  kind: UploadKind;
  book_id: string | null;
  series_id: string | null;
  target_id: string | null;
  filename: string;
  content_type: string | null;
  options: string;
  auto_commit: number;
  actor_type: "human" | "agent";
  actor_name: string;
  actor_scope: Actor["scope"];
  created_at: string;
  expires_at: string;
  received_at: string | null;
  asset_id: string | null;
  committed_at: string | null;
  result: string | null;
}

interface UploadOptions {
  label?: string;
  view?: string;
  primary?: boolean;
}

function uploadRow(id: string): UploadRow {
  const row = getDb().prepare("SELECT * FROM uploads WHERE id = ?").get(id) as UploadRow | undefined;
  if (!row) throw notFound("Envoi");
  return row;
}

function uploaderOf(row: UploadRow): Actor {
  return { type: row.actor_type, name: row.actor_name, scope: row.actor_scope };
}

function assetKind(kind: UploadKind): "illustration" | "cover" | "character" {
  if (kind === "cover") return "cover";
  if (kind === "character_image") return "character";
  return "illustration";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// ---------------------------------------------------------------------------------------
// Clean-up
// ---------------------------------------------------------------------------------------

function assetInUse(id: string): boolean {
  const db = getDb();
  return !!(
    db.prepare("SELECT 1 FROM spreads WHERE illustration_asset_id = ? LIMIT 1").get(id) ??
    db.prepare("SELECT 1 FROM books WHERE cover_asset_id = ? LIMIT 1").get(id) ??
    db.prepare("SELECT 1 FROM character_images WHERE asset_id = ? LIMIT 1").get(id) ??
    db.prepare("SELECT 1 FROM fonts WHERE asset_id = ? LIMIT 1").get(id) ??
    db.prepare("SELECT 1 FROM activity WHERE snapshot LIKE ? LIMIT 1").get(`%"${id}"%`)
  );
}

/** Forgets uploads older than a day; files never attached go with them. */
export function purgeUploads(now = Date.now()): number {
  const db = getDb();
  const old = db.prepare("SELECT id, asset_id, committed_at FROM uploads WHERE created_at < ?").all(new Date(now - UPLOAD_KEEP_MS).toISOString()) as {
    id: string;
    asset_id: string | null;
    committed_at: string | null;
  }[];
  const orphans: string[] = [];
  db.transaction(() => {
    for (const u of old) {
      db.prepare("DELETE FROM uploads WHERE id = ?").run(u.id);
      if (u.asset_id && !u.committed_at && !assetInUse(u.asset_id)) {
        db.prepare("DELETE FROM assets WHERE id = ?").run(u.asset_id);
        orphans.push(u.asset_id);
      }
    }
  })();
  deleteAssetFiles(orphans);
  return old.length;
}

// ---------------------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------------------

interface Resolved {
  kind: UploadKind;
  bookId: string | null;
  seriesId: string | null;
  targetId: string | null;
}

/** Checks the target and finds its book or series when not given. */
function resolveTarget(kind: UploadKind, targetId: string | undefined, bookId: string | undefined, seriesId: string | undefined): Resolved {
  const db = getDb();
  if (bookId && seriesId) throw badRequest("book_id ou series_id, pas les deux.");
  if (kind === "spread_illustration") {
    if (!targetId) throw badRequest("target_id (la double page) est requis pour spread_illustration.");
    const spread = db.prepare("SELECT book_id FROM spreads WHERE id = ?").get(targetId) as { book_id: string } | undefined;
    if (!spread || (bookId && spread.book_id !== bookId)) throw notFound("Double page");
    return { kind, bookId: spread.book_id, seriesId: null, targetId };
  }
  if (kind === "cover") {
    if (targetId) throw badRequest("Pas de target_id pour une couverture : book_id suffit.");
    if (!bookId) throw badRequest("book_id est requis pour une couverture.");
    seriesOfBook(bookId);
    return { kind, bookId, seriesId: null, targetId: null };
  }
  if (kind === "character_image") {
    if (!targetId) throw badRequest("target_id (le personnage) est requis pour character_image ; pour un personnage à créer, kind=image.");
    const c = bookId ? characterOfBook(bookId, targetId) : characterRow(targetId);
    if (seriesId && c.series_id !== seriesId) throw notFound("Personnage");
    return { kind, bookId: c.book_id, seriesId: c.series_id, targetId };
  }
  if (targetId) throw badRequest("Pas de target_id pour kind=image (image libre, à utiliser ensuite avec upload_id).");
  if (bookId) seriesOfBook(bookId);
  else if (seriesId) {
    if (!db.prepare("SELECT 1 FROM series WHERE id = ?").get(seriesId)) throw notFound("Série");
  } else throw badRequest("book_id ou series_id est requis.");
  return { kind, bookId: bookId ?? null, seriesId: seriesId ?? null, targetId: null };
}

export function createUploads(input: z.infer<typeof createUploadsSchema>, actor: Actor, origin: string): { uploads: UploadTicket[] } {
  purgeUploads();
  const items = input.files ?? [{ filename: input.filename as string }];
  if (!input.files && !input.filename) throw badRequest("filename est requis (ou files[]).");
  const now = Date.now();
  const tickets: UploadTicket[] = [];
  const rows: (UploadRow & { token: string })[] = items.map((f) => {
    const kind = f.kind ?? input.kind;
    if (!kind) throw badRequest(`kind est requis : ${UPLOAD_KINDS.join(", ")}.`);
    const target = resolveTarget(kind, f.targetId ?? input.targetId, input.bookId, input.seriesId);
    const contentType = f.contentType ?? input.contentType ?? null;
    if (contentType && (!contentType.startsWith("image/") || contentType.includes("svg"))) {
      throw badRequest(`Type refusé (${contentType}) : JPEG, PNG, WebP, AVIF, GIF ou TIFF.`);
    }
    const options: UploadOptions = {
      label: f.label ?? input.label,
      view: f.view ?? input.view,
      primary: f.primary ?? input.primary,
    };
    const token = crypto.randomBytes(24).toString("base64url");
    return {
      id: newId(16),
      token,
      token_hash: sha256(token),
      kind: target.kind,
      book_id: target.bookId,
      series_id: target.seriesId,
      target_id: target.targetId,
      filename: path.basename(f.filename).slice(0, 200),
      content_type: contentType,
      options: JSON.stringify(options),
      auto_commit: input.autoCommit ? 1 : 0,
      actor_type: actor.type,
      actor_name: actor.name,
      actor_scope: actor.scope,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + UPLOAD_TTL_MS).toISOString(),
      received_at: null,
      asset_id: null,
      committed_at: null,
      result: null,
    };
  });
  const db = getDb();
  db.transaction(() => {
    const insert = db.prepare(
      `INSERT INTO uploads (id, token_hash, kind, book_id, series_id, target_id, filename, content_type, options, auto_commit,
        actor_type, actor_name, actor_scope, created_at, expires_at)
       VALUES (@id, @token_hash, @kind, @book_id, @series_id, @target_id, @filename, @content_type, @options, @auto_commit,
        @actor_type, @actor_name, @actor_scope, @created_at, @expires_at)`,
    );
    for (const r of rows) {
      const { token: _token, received_at: _r, asset_id: _a, committed_at: _c, result: _res, ...values } = r;
      insert.run(values);
    }
  })();
  for (const r of rows) {
    const uploadUrl = `${origin}/api/v1/uploads/${r.id}?token=${r.token}`;
    tickets.push({
      uploadId: r.id,
      kind: r.kind,
      targetId: r.target_id,
      filename: r.filename,
      uploadUrl,
      method: "PUT",
      expiresAt: r.expires_at,
      curl: `curl -sS --fail-with-body -T ${shellQuote(r.filename)} ${shellQuote(uploadUrl)}`,
    });
  }
  return { uploads: tickets };
}

// ---------------------------------------------------------------------------------------
// Receive (PUT or POST on the signed URL, no key)
// ---------------------------------------------------------------------------------------

/** The request body as bytes: raw (curl -T) or multipart `file` (curl -F file=@…), capped. */
export async function readUploadBody(req: Request): Promise<Buffer> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES + 64 * 1024) throw new HttpError(413, "too_large", "Image trop lourde (40 Mo au plus).");
  const type = req.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) throw badRequest("Champ « file » manquant.");
    return Buffer.from(await file.arrayBuffer());
  }
  if (!req.body) throw badRequest("Corps vide : envoyer le fichier (curl -T fichier URL).");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "too_large", "Image trop lourde (40 Mo au plus).");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function checkToken(row: UploadRow, token: string | null): void {
  const expected = Buffer.from(row.token_hash);
  const given = Buffer.from(sha256(token ?? ""));
  if (!token || expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    throw new HttpError(403, "forbidden", "Lien d'envoi invalide.");
  }
}

export async function receiveUpload(id: string, token: string | null, read: () => Promise<Buffer>): Promise<UploadResult> {
  const db = getDb();
  const row = uploadRow(id);
  checkToken(row, token);
  if (row.received_at) throw new HttpError(409, "already_received", "Fichier déjà reçu : ce lien ne sert qu'une fois. Demander un nouvel envoi (create_upload).");
  if (Date.parse(row.expires_at) < Date.now()) throw new HttpError(410, "expired", "Lien d'envoi expiré (15 min) : en demander un nouveau (create_upload).");
  // Claim the link first: two concurrent PUTs cannot both land.
  if (db.prepare("UPDATE uploads SET received_at = ? WHERE id = ? AND received_at IS NULL").run(nowIso(), id).changes !== 1) {
    throw new HttpError(409, "already_received", "Fichier déjà reçu : ce lien ne sert qu'une fois.");
  }
  let asset: AssetRow;
  try {
    const buffer = await read();
    asset = await storeImage(buffer, { kind: assetKind(row.kind), bookId: row.book_id, originalName: row.filename, actor: uploaderOf(row) });
    db.prepare("UPDATE uploads SET asset_id = ? WHERE id = ?").run(asset.id, id);
  } catch (err) {
    // A failed transfer or an unreadable file: the link can be used again until it expires.
    db.prepare("UPDATE uploads SET received_at = NULL WHERE id = ?").run(id);
    throw err;
  }
  if (row.auto_commit && row.kind !== "image") return commitUpload(id);
  return describe({ ...row, asset_id: asset.id }, asset, "received");
}

// ---------------------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------------------

function warningsFor(row: Pick<UploadRow, "kind" | "book_id">, asset: AssetRow): { dpi: number | null; printPixels: { width: number; height: number } | null; warnings: UploadWarning[] } {
  const warnings: UploadWarning[] = [];
  const w = asset.width ?? 0;
  const h = asset.height ?? 0;
  if (asset.ext === "tif") warnings.push({ code: "converted", message: "TIFF : une copie JPEG pleine résolution sert à l'écran et à l'impression." });
  if (row.kind === "character_image" || !row.book_id) {
    if (Math.max(w, h) < 1024) {
      warnings.push({ code: "lowResolution", message: `${w} × ${h} px : une référence d'au moins 1024 px de côté aide le générateur d'images.` });
    }
    return { dpi: null, printPixels: null, warnings };
  }
  const format = getFormat((getDb().prepare("SELECT format FROM books WHERE id = ?").get(row.book_id) as { format: string }).format);
  const px = requiredPixels(format);
  const dpi = imageDpi(row.book_id, asset);
  if (dpi !== null && dpi < PRINT_DPI) {
    warnings.push({
      code: "lowResolution",
      message: `${dpi} dpi à l'impression (${PRINT_DPI} visés, soit ${px.width} × ${px.height} px fonds perdus compris). Gardée telle quelle.`,
    });
  }
  if (w && h && Math.abs(w / h / (px.width / px.height) - 1) > 0.03) {
    warnings.push({ code: "aspectRatio", message: "Proportions différentes de la page : l'image sera recadrée (cadrage « remplir ») ou bordée (« contenir »)." });
  }
  return { dpi, printPixels: px, warnings };
}

/** Dimensions, print resolution and warnings of an image sent another way (base64, URL, form). */
export function imageReport(kind: UploadKind, bookId: string | null, asset: AssetRow, imageId?: string): Omit<UploadResult, "uploadId" | "status" | "filename"> {
  return {
    kind,
    targetId: null,
    asset: { id: asset.id, width: asset.width, height: asset.height, format: asset.ext, sizeBytes: asset.size },
    ...warningsFor({ kind, book_id: bookId }, asset),
    ...(imageId ? { imageId } : {}),
  };
}

function describe(row: UploadRow, asset: AssetRow, status: UploadResult["status"], imageId?: string): UploadResult {
  return {
    uploadId: row.id,
    status,
    kind: row.kind,
    targetId: row.target_id,
    filename: row.filename,
    asset: { id: asset.id, width: asset.width, height: asset.height, format: asset.ext, sizeBytes: asset.size },
    ...warningsFor(row, asset),
    ...(imageId ? { imageId } : {}),
  };
}

function receivedRow(id: string): { row: UploadRow; asset: AssetRow } {
  const row = uploadRow(id);
  if (!row.received_at || !row.asset_id) {
    throw new HttpError(409, "not_received", `Fichier « ${row.filename} » pas encore reçu : l'envoyer d'abord (curl -T fichier URL).`);
  }
  if (Date.parse(row.created_at) + UPLOAD_KEEP_MS < Date.now()) throw new HttpError(410, "expired", "Envoi trop ancien (24 h) : recommencer.");
  return { row, asset: getAsset(row.asset_id) };
}

function markCommitted(id: string, result: UploadResult): void {
  getDb().prepare("UPDATE uploads SET committed_at = ?, result = ? WHERE id = ?").run(nowIso(), JSON.stringify(result), id);
}

/** Attaches a received file to its target. Idempotent: a second call returns the first result. */
export function commitUpload(id: string): UploadResult {
  const db = getDb();
  const { row, asset } = receivedRow(id);
  if (row.committed_at && row.result) return JSON.parse(row.result) as UploadResult;
  const actor = uploaderOf(row);
  let result!: UploadResult;
  db.transaction(() => {
    if (row.kind === "spread_illustration") {
      setIllustration(row.book_id as string, row.target_id as string, asset, actor);
      result = describe(row, asset, "attached");
    } else if (row.kind === "cover") {
      setCover(row.book_id as string, asset, actor);
      result = describe(row, asset, "attached");
    } else if (row.kind === "character_image") {
      const options = JSON.parse(row.options) as UploadOptions;
      const { imageIds } = addCharacterImages(row.target_id as string, [{ asset, ...options }], actor);
      result = describe(row, asset, "attached", imageIds[0]);
    } else {
      // A free image waits for a tool that takes upload_id.
      result = describe(row, asset, "ready");
      return;
    }
    markCommitted(id, result);
  })();
  return result;
}

export function commitUploads(ids: string[]): { results: (UploadResult | { uploadId: string; error: string; message: string })[] } {
  return {
    results: ids.map((id) => {
      try {
        return commitUpload(id);
      } catch (err) {
        if (err instanceof HttpError) return { uploadId: id, error: err.code, message: err.message };
        throw err;
      }
    }),
  };
}

// ---------------------------------------------------------------------------------------
// Reuse by upload_id (set_illustration, set_cover, add_character_image, create_character)
// ---------------------------------------------------------------------------------------

function sameUniverse(row: UploadRow, owner: Owner): boolean {
  if (owner.bookId) return row.book_id === owner.bookId || (row.series_id !== null && row.series_id === seriesOfBook(owner.bookId));
  if (row.series_id === owner.seriesId) return true;
  return row.book_id !== null && seriesOfBook(row.book_id) === owner.seriesId;
}

/**
 * The asset of a received upload, for a target the tool names. Marks the upload as used
 * (call inside the transaction that attaches it).
 */
function takeUpload(id: string, owner: Owner, kind: UploadKind, targetId: string | null): { row: UploadRow; asset: AssetRow } {
  const { row, asset } = receivedRow(id);
  if (row.committed_at) throw new HttpError(409, "already_used", `L'envoi « ${row.filename} » est déjà utilisé.`);
  if (!sameUniverse(row, owner)) throw badRequest(`L'envoi « ${row.filename} » a été préparé pour un autre livre ou une autre série.`);
  // The file now belongs to its new owner: deleting the book it came from must not take it.
  getDb().prepare("UPDATE assets SET book_id = ? WHERE id = ?").run(owner.bookId ?? null, asset.id);
  const used: UploadRow = { ...row, kind, target_id: targetId, book_id: owner.bookId ?? row.book_id };
  markCommitted(id, describe(used, asset, "attached"));
  return { row: used, asset: { ...asset, book_id: owner.bookId ?? null } };
}

export function setIllustrationFromUpload(bookId: string, spreadId: string, uploadId: string, actor: Actor): UploadResult {
  getSpread(bookId, spreadId);
  let result!: UploadResult;
  getDb().transaction(() => {
    const { row, asset } = takeUpload(uploadId, { bookId }, "spread_illustration", spreadId);
    setIllustration(bookId, spreadId, asset, actor);
    result = describe(row, asset, "attached");
  })();
  return result;
}

export function setCoverFromUpload(bookId: string, uploadId: string, actor: Actor): UploadResult {
  let result!: UploadResult;
  getDb().transaction(() => {
    const { row, asset } = takeUpload(uploadId, { bookId }, "cover", null);
    setCover(bookId, asset, actor);
    result = describe(row, asset, "attached");
  })();
  return result;
}

export function addCharacterImageFromUpload(characterId: string, uploadId: string, options: UploadOptions, actor: Actor): UploadResult {
  const c = characterRow(characterId);
  const owner: Owner = c.book_id ? { bookId: c.book_id } : { seriesId: c.series_id as string };
  let result!: UploadResult;
  getDb().transaction(() => {
    const { row, asset } = takeUpload(uploadId, owner, "character_image", characterId);
    const saved = JSON.parse(row.options) as UploadOptions;
    const { imageIds } = addCharacterImages(characterId, [{ asset, ...saved, ...stripUndefined(options) }], actor);
    result = describe(row, asset, "attached", imageIds[0]);
  })();
  return result;
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** create_character with images[] of upload ids, in one transaction. */
export function createCharacterWithUploads(
  owner: Owner,
  input: CreateCharacterInput & { images?: { uploadId: string; label?: string; view?: string; primary?: boolean }[] },
  actor: Actor,
): ReturnType<typeof createCharacter> {
  const { images = [], ...rest } = input;
  let character!: ReturnType<typeof createCharacter>;
  getDb().transaction(() => {
    const assets = images.map((img) => {
      const { row, asset } = takeUpload(img.uploadId, owner, "character_image", null);
      const saved = JSON.parse(row.options) as UploadOptions;
      return { asset, ...saved, ...stripUndefined({ label: img.label, view: img.view, primary: img.primary }) };
    });
    character = createCharacter(owner, rest, actor, assets);
  })();
  return character;
}
