import { oauthErrorResponse, preflight } from "@/server/oauth/errors";
import { CORS_HEADERS } from "@/server/oauth/metadata";
import { revokeToken } from "@/server/oauth/flow";
import { basicCredentials, readForm } from "@/server/oauth/request";

/** RFC 7009: always 200, whether the token existed or not. */
export async function POST(req: Request) {
  try {
    const form = await readForm(req);
    const basic = basicCredentials(req);
    const token = form.get("token");
    if (token) revokeToken(token, basic?.id ?? form.get("client_id") ?? undefined, basic?.secret ?? form.get("client_secret"));
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    return oauthErrorResponse(err);
  }
}

export const OPTIONS = preflight;
