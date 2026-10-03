import crypto from "node:crypto";
import { getDb } from "../db";
import { fetchPublic } from "../net";
import { newId, nowIso, sha256 } from "../util";
import { OAuthError } from "./errors";

// OAuth clients (ADR-0007). Two ways in:
// - CIMD: client_id is the https URL of a JSON document describing the client (Claude's apps);
// - DCR (RFC 7591): the client registers itself and gets a random client_id.
// Either way the owner still signs in and consents: a client alone can do nothing.

export interface OAuthClient {
  id: string;
  name: string;
  redirectUris: string[];
  kind: "dcr" | "cimd";
  confidential: boolean;
}

interface ClientRow {
  id: string;
  name: string;
  redirect_uris: string;
  secret_hash: string | null;
  kind: "dcr" | "cimd";
  created_at: string;
  updated_at: string;
}

const CIMD_TTL_MS = 24 * 3600_000;
const FORBIDDEN_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "blob:", "about:"]);

function toClient(row: ClientRow): OAuthClient {
  return {
    id: row.id,
    name: row.name,
    redirectUris: JSON.parse(row.redirect_uris) as string[],
    kind: row.kind,
    confidential: row.secret_hash !== null,
  };
}

export function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** https anywhere, http only on loopback (native apps), private-use schemes (RFC 8252); never a fragment. */
export function isAcceptableRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:") return isLoopbackHost(u.hostname);
  return !FORBIDDEN_SCHEMES.has(u.protocol);
}

/**
 * Exact match, except loopback redirects whose port changes per session (RFC 8252 §7.3).
 * Claude Code declares http://localhost/callback and http://127.0.0.1/callback.
 */
export function redirectUriMatches(registered: string, asked: string): boolean {
  if (registered === asked) return true;
  try {
    const r = new URL(registered);
    const a = new URL(asked);
    return (
      r.protocol === "http:" &&
      a.protocol === "http:" &&
      isLoopbackHost(r.hostname) &&
      r.hostname === a.hostname &&
      r.pathname === a.pathname &&
      r.search === a.search
    );
  } catch {
    return false;
  }
}

export function clientAllowsRedirect(client: OAuthClient, redirectUri: string): boolean {
  return client.redirectUris.some((r) => redirectUriMatches(r, redirectUri));
}

// ---------------------------------------------------------------------------------------
// DCR (RFC 7591)
// ---------------------------------------------------------------------------------------

export interface RegistrationResponse {
  client_id: string;
  client_secret?: string;
  client_id_issued_at: number;
  client_secret_expires_at?: number;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}

export function registerClient(body: unknown): RegistrationResponse {
  if (!body || typeof body !== "object") throw new OAuthError("invalid_client_metadata", "Corps JSON attendu.");
  const meta = body as Record<string, unknown>;
  const uris = meta.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 20 || !uris.every((u) => typeof u === "string")) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris : au moins une adresse.");
  }
  const bad = (uris as string[]).find((u) => !isAcceptableRedirectUri(u));
  if (bad) throw new OAuthError("invalid_redirect_uri", `Adresse de retour refusée : ${bad}`);
  const grants = Array.isArray(meta.grant_types) ? (meta.grant_types as unknown[]) : ["authorization_code"];
  if (grants.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    throw new OAuthError("invalid_client_metadata", "grant_types : authorization_code et refresh_token seulement.");
  }
  const method = typeof meta.token_endpoint_auth_method === "string" ? meta.token_endpoint_auth_method : "none";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(method)) {
    throw new OAuthError("invalid_client_metadata", "token_endpoint_auth_method non pris en charge.");
  }
  const name = (typeof meta.client_name === "string" && meta.client_name.trim()) || new URL(uris[0] as string).host || "Client";
  // DCR registers a client per fresh connection (claude.ai): forget the ones never used.
  getDb()
    .prepare(
      `DELETE FROM oauth_clients WHERE kind = 'dcr' AND created_at < ?
         AND id NOT IN (SELECT client_id FROM oauth_grants) AND id NOT IN (SELECT client_id FROM oauth_codes)`,
    )
    .run(new Date(Date.now() - 30 * 86_400_000).toISOString());
  const id = `lfc_${newId(20)}`;
  const secret = method === "none" ? null : crypto.randomBytes(32).toString("base64url");
  const now = nowIso();
  getDb()
    .prepare("INSERT INTO oauth_clients (id, name, redirect_uris, secret_hash, kind, created_at, updated_at) VALUES (?, ?, ?, ?, 'dcr', ?, ?)")
    .run(id, name.slice(0, 80), JSON.stringify(uris), secret ? sha256(secret) : null, now, now);
  return {
    client_id: id,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: name.slice(0, 80),
    redirect_uris: uris as string[],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: method,
  };
}

// ---------------------------------------------------------------------------------------
// CIMD (client ID metadata documents)
// ---------------------------------------------------------------------------------------

export type MetadataFetcher = (url: string) => Promise<unknown>;

export const fetchClientMetadata: MetadataFetcher = async (url) => {
  const buffer = await fetchPublic(url, { maxBytes: 64 * 1024, timeoutMs: 5_000, what: "Document du client" });
  return JSON.parse(buffer.toString("utf8")) as unknown;
};

function isMetadataUrl(clientId: string): boolean {
  try {
    const u = new URL(clientId);
    return u.protocol === "https:" && u.pathname !== "/" && !u.hash;
  } catch {
    return false;
  }
}

async function loadCimdClient(url: string, fetcher: MetadataFetcher): Promise<OAuthClient> {
  let doc: Record<string, unknown>;
  try {
    doc = (await fetcher(url)) as Record<string, unknown>;
  } catch {
    throw new OAuthError("invalid_client", "Document du client illisible.");
  }
  if (!doc || typeof doc !== "object" || doc.client_id !== url) {
    throw new OAuthError("invalid_client", "Le document du client ne correspond pas à son adresse.");
  }
  const uris = doc.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every((u) => typeof u === "string" && isAcceptableRedirectUri(u))) {
    throw new OAuthError("invalid_client", "Adresses de retour du client invalides.");
  }
  const method = doc.token_endpoint_auth_method;
  if (method !== undefined && method !== "none") {
    throw new OAuthError("invalid_client", "Seuls les clients publics sont acceptés par document.");
  }
  const name = ((typeof doc.client_name === "string" && doc.client_name.trim()) || new URL(url).host).slice(0, 80);
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO oauth_clients (id, name, redirect_uris, secret_hash, kind, created_at, updated_at) VALUES (?, ?, ?, NULL, 'cimd', ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, redirect_uris = excluded.redirect_uris, updated_at = excluded.updated_at`,
    )
    .run(url, name, JSON.stringify(uris), now, now);
  return { id: url, name, redirectUris: uris as string[], kind: "cimd", confidential: false };
}

/** The client behind a client_id: a registered one, or a metadata document (cached 24 h). */
export async function resolveClient(clientId: string, fetcher: MetadataFetcher = fetchClientMetadata): Promise<OAuthClient> {
  if (!clientId) throw new OAuthError("invalid_client", "client_id manquant.");
  const row = getDb().prepare("SELECT * FROM oauth_clients WHERE id = ?").get(clientId) as ClientRow | undefined;
  if (isMetadataUrl(clientId)) {
    if (row && Date.now() - Date.parse(row.updated_at) < CIMD_TTL_MS) return toClient(row);
    return loadCimdClient(clientId, fetcher);
  }
  if (!row) throw new OAuthError("invalid_client", "Client inconnu : le reconnecter.");
  return toClient(row);
}

/** Token and revocation endpoints: a confidential client proves itself with its secret. */
export function authenticateClient(clientId: string, secret: string | null): OAuthClient {
  const row = getDb().prepare("SELECT * FROM oauth_clients WHERE id = ?").get(clientId) as ClientRow | undefined;
  if (!row) throw new OAuthError("invalid_client", "Client inconnu.", 401);
  if (row.secret_hash) {
    const given = Buffer.from(sha256(secret ?? ""));
    const expected = Buffer.from(row.secret_hash);
    if (!secret || !crypto.timingSafeEqual(given, expected)) throw new OAuthError("invalid_client", "Secret du client incorrect.", 401);
  }
  return toClient(row);
}
