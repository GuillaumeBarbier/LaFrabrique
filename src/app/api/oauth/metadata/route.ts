import { publicOrigin } from "@/server/http";
import { preflight } from "@/server/oauth/errors";
import { authorizationServerMetadata, CORS_HEADERS } from "@/server/oauth/metadata";

export const dynamic = "force-dynamic";

/** RFC 8414, served at /.well-known/oauth-authorization-server (rewrite in next.config.ts). */
export function GET(req: Request) {
  return Response.json(authorizationServerMetadata(publicOrigin(req)), {
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" },
  });
}

export const OPTIONS = preflight;
