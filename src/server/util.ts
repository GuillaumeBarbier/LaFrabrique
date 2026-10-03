import crypto from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Short random identifier (lowercase, URL-safe). 12 chars ≈ 62 bits. */
export function newId(length = 12): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[(bytes[i] as number) % ALPHABET.length];
  return out;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Ressource") => new HttpError(404, "not_found", `${what} introuvable.`);
export const forbidden = (message = "Action non autorisée.") => new HttpError(403, "forbidden", message);
export const badRequest = (message: string, details?: unknown) => new HttpError(400, "bad_request", message, details);
