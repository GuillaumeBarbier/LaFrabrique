import crypto from "node:crypto";
import { getDb } from "../db";
import type { Actor } from "../http";
import { newId, nowIso, sha256 } from "../util";
import { authenticateClient, clientAllowsRedirect, fetchClientMetadata, type MetadataFetcher, type OAuthClient, resolveClient } from "./clients";
import { OAuthError } from "./errors";
import { oauthUrls, type OAuthScope } from "./metadata";

// Authorization code + PKCE, refresh token rotation, access tokens bound to the MCP resource
// (ADR-0007). Every grant is one agent: a name that signs its work, and a scope.

export const ACCESS_PREFIX = "lfat_";
export const REFRESH_PREFIX = "lfrt_";
const CODE_TTL_MS = 10 * 60_000;
export const ACCESS_TTL_S = 3600;
const REFRESH_TTL_MS = 60 * 86_400_000;

export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  resource: string;
  requestedScope: OAuthScope;
}

export type ValidatedRequest =
  | { ok: true; client: OAuthClient; request: AuthorizationRequest }
  /** `redirect` absent: the client or its redirect URI cannot be trusted, show an error page. */
  | { ok: false; error: string; description: string; redirect?: string };

function errorRedirect(redirectUri: string, error: string, description: string, state: string | null): string {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  u.searchParams.set("error_description", description);
  if (state) u.searchParams.set("state", state);
  return u.toString();
}

function sameResource(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

/** Validates an authorization request (query of the authorization endpoint). */
export async function validateAuthorizationRequest(
  params: Record<string, string | undefined>,
  origin: string,
  fetcher: MetadataFetcher = fetchClientMetadata,
): Promise<ValidatedRequest> {
  let client: OAuthClient;
  try {
    client = await resolveClient(params.client_id ?? "", fetcher);
  } catch (err) {
    return { ok: false, error: "invalid_client", description: err instanceof Error ? err.message : "Client invalide." };
  }
  const redirectUri = params.redirect_uri ?? "";
  if (!redirectUri || !clientAllowsRedirect(client, redirectUri)) {
    return { ok: false, error: "invalid_request", description: "Adresse de retour non enregistrée pour ce client." };
  }
  const state = params.state ?? null;
  const fail = (error: string, description: string): ValidatedRequest => ({
    ok: false,
    error,
    description,
    redirect: errorRedirect(redirectUri, error, description, state),
  });
  if (params.response_type !== "code") return fail("unsupported_response_type", "Seul response_type=code est accepté.");
  if (!params.code_challenge || params.code_challenge_method !== "S256") {
    return fail("invalid_request", "PKCE S256 obligatoire (code_challenge, code_challenge_method=S256).");
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(params.code_challenge)) return fail("invalid_request", "code_challenge invalide.");
  const canonical = oauthUrls(origin).resource;
  const resource = params.resource ?? canonical;
  if (!sameResource(resource, canonical)) return fail("invalid_target", `Ressource inconnue : ${resource}`);
  const scopes = (params.scope ?? "").split(/\s+/).filter(Boolean);
  const requestedScope: OAuthScope = scopes.includes("read") && !scopes.includes("write") ? "read" : "write";
  return {
    ok: true,
    client,
    request: { clientId: client.id, redirectUri, state, codeChallenge: params.code_challenge, resource: canonical, requestedScope },
  };
}

/** The owner said yes: a single-use code, valid 10 minutes, back to the client. */
export function approveAuthorization(request: AuthorizationRequest, decision: { name: string; scope: OAuthScope }): string {
  const code = crypto.randomBytes(32).toString("base64url");
  getDb()
    .prepare(
      `INSERT INTO oauth_codes (hash, client_id, redirect_uri, code_challenge, scope, name, resource, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sha256(code),
      request.clientId,
      request.redirectUri,
      request.codeChallenge,
      decision.scope,
      decision.name.trim().slice(0, 60) || "Agent",
      request.resource,
      new Date(Date.now() + CODE_TTL_MS).toISOString(),
    );
  const u = new URL(request.redirectUri);
  u.searchParams.set("code", code);
  if (request.state) u.searchParams.set("state", request.state);
  return u.toString();
}

export function denyAuthorization(request: AuthorizationRequest): string {
  return errorRedirect(request.redirectUri, "access_denied", "Accès refusé.", request.state);
}

// ---------------------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------------------

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: OAuthScope;
}

interface GrantRow {
  id: string;
  client_id: string;
  client_name: string;
  redirect_host: string;
  name: string;
  scope: OAuthScope;
  resource: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function cleanUp(): void {
  const old = new Date(Date.now() - 86_400_000).toISOString();
  getDb().prepare("DELETE FROM oauth_codes WHERE expires_at < ?").run(old);
  getDb().prepare("DELETE FROM oauth_tokens WHERE expires_at < ?").run(old);
}

function issueTokens(grant: Pick<GrantRow, "id" | "scope">): TokenResponse {
  const db = getDb();
  const access = `${ACCESS_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  const refresh = `${REFRESH_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  const now = Date.now();
  const insert = db.prepare("INSERT INTO oauth_tokens (hash, grant_id, kind, created_at, expires_at) VALUES (?, ?, ?, ?, ?)");
  insert.run(sha256(access), grant.id, "access", new Date(now).toISOString(), new Date(now + ACCESS_TTL_S * 1000).toISOString());
  insert.run(sha256(refresh), grant.id, "refresh", new Date(now).toISOString(), new Date(now + REFRESH_TTL_MS).toISOString());
  cleanUp();
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: grant.scope };
}

function revokeGrantRow(grantId: string): void {
  const db = getDb();
  db.prepare("UPDATE oauth_grants SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?").run(nowIso(), grantId);
  db.prepare("DELETE FROM oauth_tokens WHERE grant_id = ?").run(grantId);
}

/**
 * A replayed code or refresh token. Thrown inside the transaction (which rolls back), the
 * revocation happens after it: revoking inside would be rolled back with the rest.
 */
class Replay extends Error {
  constructor(
    public readonly grantId: string | null,
    public readonly description: string,
  ) {
    super(description);
  }
}

function runRevokingOnReplay<T>(fn: () => T): T {
  try {
    return getDb().transaction(fn)();
  } catch (err) {
    if (err instanceof Replay) {
      if (err.grantId) revokeGrantRow(err.grantId);
      throw new OAuthError("invalid_grant", err.description);
    }
    throw err;
  }
}

function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = Buffer.from(crypto.createHash("sha256").update(verifier).digest("base64url"));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && crypto.timingSafeEqual(computed, expected);
}

export interface TokenRequest {
  grantType: string;
  code?: string;
  redirectUri?: string;
  codeVerifier?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string | null;
  resource?: string;
}

export function exchangeToken(req: TokenRequest): TokenResponse {
  if (!req.clientId) throw new OAuthError("invalid_client", "client_id manquant.", 401);
  const client = authenticateClient(req.clientId, req.clientSecret ?? null);
  if (req.grantType === "authorization_code") return exchangeCode(client, req);
  if (req.grantType === "refresh_token") return refresh(client, req);
  throw new OAuthError("unsupported_grant_type", "grant_type : authorization_code ou refresh_token.");
}

interface CodeRow {
  hash: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: OAuthScope;
  name: string;
  resource: string;
  expires_at: string;
  used_at: string | null;
  grant_id: string | null;
}

function exchangeCode(client: OAuthClient, req: TokenRequest): TokenResponse {
  const db = getDb();
  if (!req.code || !req.codeVerifier) throw new OAuthError("invalid_request", "code et code_verifier obligatoires.");
  return runRevokingOnReplay(() => {
    const row = db.prepare("SELECT * FROM oauth_codes WHERE hash = ?").get(sha256(req.code as string)) as CodeRow | undefined;
    if (!row) throw new OAuthError("invalid_grant", "Code inconnu.");
    // A replayed code: whatever it produced is no longer trusted.
    if (row.used_at) throw new Replay(row.grant_id, "Code déjà utilisé.");
    if (Date.parse(row.expires_at) < Date.now()) throw new OAuthError("invalid_grant", "Code expiré.");
    if (row.client_id !== client.id) throw new OAuthError("invalid_grant", "Code émis pour un autre client.");
    if (row.redirect_uri !== req.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri différente de la demande.");
    if (!verifyPkce(req.codeVerifier as string, row.code_challenge)) throw new OAuthError("invalid_grant", "code_verifier incorrect.");
    if (req.resource && !sameResource(req.resource, row.resource)) throw new OAuthError("invalid_target", "Ressource différente de la demande.");
    const grant: GrantRow = {
      id: newId(),
      client_id: client.id,
      client_name: client.name,
      redirect_host: new URL(row.redirect_uri).host || new URL(row.redirect_uri).protocol,
      name: row.name,
      scope: row.scope,
      resource: row.resource,
      created_at: nowIso(),
      last_used_at: null,
      revoked_at: null,
    };
    db.prepare(
      `INSERT INTO oauth_grants (id, client_id, client_name, redirect_host, name, scope, resource, created_at)
       VALUES (@id, @client_id, @client_name, @redirect_host, @name, @scope, @resource, @created_at)`,
    ).run(grant);
    db.prepare("UPDATE oauth_codes SET used_at = ?, grant_id = ? WHERE hash = ?").run(nowIso(), grant.id, row.hash);
    return issueTokens(grant);
  });
}

function refresh(client: OAuthClient, req: TokenRequest): TokenResponse {
  const db = getDb();
  if (!req.refreshToken) throw new OAuthError("invalid_request", "refresh_token obligatoire.");
  return runRevokingOnReplay(() => {
    const row = db
      .prepare(
        `SELECT t.hash, t.expires_at, t.used_at, g.id, g.client_id, g.scope, g.resource, g.revoked_at
         FROM oauth_tokens t JOIN oauth_grants g ON g.id = t.grant_id WHERE t.hash = ? AND t.kind = 'refresh'`,
      )
      .get(sha256(req.refreshToken as string)) as
      | { hash: string; expires_at: string; used_at: string | null; id: string; client_id: string; scope: OAuthScope; resource: string; revoked_at: string | null }
      | undefined;
    if (!row || row.revoked_at) throw new OAuthError("invalid_grant", "Jeton de rafraîchissement inconnu ou révoqué.");
    if (row.client_id !== client.id) throw new OAuthError("invalid_grant", "Jeton émis pour un autre client.");
    // Rotation: a refresh token used twice was stolen or replayed. Revoke the connection.
    if (row.used_at) throw new Replay(row.id, "Jeton déjà utilisé : connexion révoquée.");
    if (Date.parse(row.expires_at) < Date.now()) throw new OAuthError("invalid_grant", "Jeton expiré.");
    if (req.resource && !sameResource(req.resource, row.resource)) throw new OAuthError("invalid_target", "Ressource différente.");
    db.prepare("UPDATE oauth_tokens SET used_at = ? WHERE hash = ?").run(nowIso(), row.hash);
    return issueTokens({ id: row.id, scope: row.scope });
  });
}

/** RFC 7009: a refresh token ends the whole connection, an access token only itself. */
export function revokeToken(token: string, clientId: string | undefined, clientSecret: string | null): void {
  const row = getDb()
    .prepare("SELECT t.hash, t.kind, t.grant_id, g.client_id FROM oauth_tokens t JOIN oauth_grants g ON g.id = t.grant_id WHERE t.hash = ?")
    .get(sha256(token)) as { hash: string; kind: string; grant_id: string; client_id: string } | undefined;
  if (!row) return;
  if (clientId) {
    authenticateClient(clientId, clientSecret);
    if (row.client_id !== clientId) return;
  }
  if (row.kind === "refresh") revokeGrantRow(row.grant_id);
  else getDb().prepare("DELETE FROM oauth_tokens WHERE hash = ?").run(row.hash);
}

// ---------------------------------------------------------------------------------------
// Using a token, managing connections
// ---------------------------------------------------------------------------------------

/** An access token on the MCP endpoint → the agent of its grant. */
export function actorFromAccessToken(token: string): Actor | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT t.expires_at, g.id, g.name, g.scope, g.last_used_at, g.revoked_at
       FROM oauth_tokens t JOIN oauth_grants g ON g.id = t.grant_id WHERE t.hash = ? AND t.kind = 'access'`,
    )
    .get(sha256(token)) as
    | { expires_at: string; id: string; name: string; scope: OAuthScope; last_used_at: string | null; revoked_at: string | null }
    | undefined;
  if (!row || row.revoked_at || Date.parse(row.expires_at) < Date.now()) return null;
  if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > 60_000) {
    db.prepare("UPDATE oauth_grants SET last_used_at = ? WHERE id = ?").run(nowIso(), row.id);
  }
  return { type: "agent", name: row.name, scope: row.scope, keyId: `oauth:${row.id}` };
}

export interface OAuthConnection {
  id: string;
  name: string;
  clientName: string;
  redirectHost: string;
  scope: OAuthScope;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  /** No refresh token left: the client must sign in again. */
  expired: boolean;
}

export function listConnections(): OAuthConnection[] {
  const now = nowIso();
  const rows = getDb()
    .prepare(
      `SELECT g.*, (SELECT COUNT(*) FROM oauth_tokens t WHERE t.grant_id = g.id AND t.kind = 'refresh' AND t.used_at IS NULL AND t.expires_at > ?) AS live
       FROM oauth_grants g ORDER BY g.revoked_at IS NOT NULL, COALESCE(g.last_used_at, g.created_at) DESC`,
    )
    .all(now) as (GrantRow & { live: number })[];
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    clientName: g.client_name,
    redirectHost: g.redirect_host,
    scope: g.scope,
    createdAt: g.created_at,
    lastUsedAt: g.last_used_at,
    revokedAt: g.revoked_at,
    expired: !g.revoked_at && g.live === 0,
  }));
}

export function revokeConnection(id: string): boolean {
  const exists = getDb().prepare("SELECT 1 FROM oauth_grants WHERE id = ?").get(id);
  if (!exists) return false;
  revokeGrantRow(id);
  return true;
}
