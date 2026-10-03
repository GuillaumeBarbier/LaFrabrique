// OAuth 2.1 for the MCP connector (ADR-0007): La Fabrique is both the authorization server and
// the protected resource. Discovery follows the MCP authorization spec (RFC 9728 + RFC 8414).

export const OAUTH_SCOPES = ["read", "write"] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export function oauthUrls(origin: string) {
  return {
    issuer: origin,
    authorize: `${origin}/oauth/autoriser`,
    token: `${origin}/api/oauth/token`,
    register: `${origin}/api/oauth/register`,
    revoke: `${origin}/api/oauth/revoke`,
    /** The MCP endpoint, exactly as the user types it in Claude. */
    resource: `${origin}/api/mcp`,
    resourceMetadata: `${origin}/.well-known/oauth-protected-resource/api/mcp`,
  };
}

export function authorizationServerMetadata(origin: string) {
  const u = oauthUrls(origin);
  return {
    issuer: u.issuer,
    authorization_endpoint: u.authorize,
    token_endpoint: u.token,
    registration_endpoint: u.register,
    revocation_endpoint: u.revoke,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    // "none" + CIMD: Claude identifies itself with its metadata document (public client).
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    client_id_metadata_document_supported: true,
    scopes_supported: [...OAUTH_SCOPES, "offline_access"],
    service_documentation: "https://github.com/GuillaumeBarbier/LaFrabrique/blob/main/docs/tech/02-api-agents.md",
  };
}

export function protectedResourceMetadata(origin: string) {
  const u = oauthUrls(origin);
  return {
    resource: u.resource,
    authorization_servers: [u.issuer],
    scopes_supported: [...OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "La Fabrique",
  };
}

/** The 401 that starts sign-in: Claude follows `resource_metadata` (a 401 is required). */
export function wwwAuthenticate(origin: string, error?: "invalid_token"): string {
  const parts = [`realm="La Fabrique"`, `resource_metadata="${oauthUrls(origin).resourceMetadata}"`, `scope="read write"`];
  if (error) parts.push(`error="${error}"`);
  return `Bearer ${parts.join(", ")}`;
}

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};
