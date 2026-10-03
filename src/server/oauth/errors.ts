import { CORS_HEADERS } from "./metadata";

/** An RFC 6749 error, answered as JSON by the token, registration and revocation endpoints. */
export class OAuthError extends Error {
  constructor(
    public readonly error: string,
    public readonly description: string,
    public readonly status = 400,
  ) {
    super(description);
  }
}

export function oauthJson(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache", ...CORS_HEADERS, ...extra },
  });
}

export function oauthErrorResponse(err: unknown): Response {
  if (err instanceof OAuthError) {
    const extra: Record<string, string> = err.status === 401 ? { "WWW-Authenticate": 'Basic realm="La Fabrique"' } : {};
    return oauthJson({ error: err.error, error_description: err.description }, err.status, extra);
  }
  console.error(err);
  return oauthJson({ error: "server_error", error_description: "Erreur interne." }, 500);
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
