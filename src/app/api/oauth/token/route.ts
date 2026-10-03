import { clearHits, isRateLimited, recordHit } from "@/server/auth/rate-limit";
import { OAuthError, oauthErrorResponse, oauthJson, preflight } from "@/server/oauth/errors";
import { exchangeToken } from "@/server/oauth/flow";
import { basicCredentials, clientIp, readForm } from "@/server/oauth/request";

const LIMIT = 30;
const WINDOW_MS = 15 * 60_000;

/** Token endpoint: authorization_code (PKCE) and refresh_token (rotated). Form-encoded, RFC 6749. */
export async function POST(req: Request) {
  const ip = `token:${clientIp(req)}`;
  try {
    if (isRateLimited(ip, LIMIT, WINDOW_MS)) throw new OAuthError("temporarily_unavailable", "Trop d'essais.", 429);
    const form = await readForm(req);
    const basic = basicCredentials(req);
    const tokens = exchangeToken({
      grantType: form.get("grant_type") ?? "",
      code: form.get("code") ?? undefined,
      redirectUri: form.get("redirect_uri") ?? undefined,
      codeVerifier: form.get("code_verifier") ?? undefined,
      refreshToken: form.get("refresh_token") ?? undefined,
      clientId: basic?.id ?? form.get("client_id") ?? undefined,
      clientSecret: basic?.secret ?? form.get("client_secret"),
      resource: form.get("resource") ?? undefined,
    });
    clearHits(ip);
    return oauthJson(tokens);
  } catch (err) {
    if (err instanceof OAuthError && err.status < 500 && err.status !== 429) recordHit(ip);
    return oauthErrorResponse(err);
  }
}

export const OPTIONS = preflight;
