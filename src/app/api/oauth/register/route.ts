import { isRateLimited, recordHit } from "@/server/auth/rate-limit";
import { registerClient } from "@/server/oauth/clients";
import { OAuthError, oauthErrorResponse, oauthJson, preflight } from "@/server/oauth/errors";
import { clientIp } from "@/server/oauth/request";

const LIMIT = 30;
const WINDOW_MS = 3600_000;

/** Dynamic client registration (RFC 7591). A client alone can do nothing: the owner still consents. */
export async function POST(req: Request) {
  try {
    const ip = `register:${clientIp(req)}`;
    if (isRateLimited(ip, LIMIT, WINDOW_MS)) throw new OAuthError("temporarily_unavailable", "Trop d'enregistrements.", 429);
    recordHit(ip);
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new OAuthError("invalid_client_metadata", "Corps JSON attendu.");
    }
    return oauthJson(registerClient(body), 201);
  } catch (err) {
    return oauthErrorResponse(err);
  }
}

export const OPTIONS = preflight;
