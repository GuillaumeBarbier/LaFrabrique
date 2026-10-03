import { publicOrigin } from "@/server/http";
import { preflight } from "@/server/oauth/errors";
import { CORS_HEADERS, protectedResourceMetadata } from "@/server/oauth/metadata";

export const dynamic = "force-dynamic";

/** RFC 9728, served at /.well-known/oauth-protected-resource[/api/mcp] (rewrite in next.config.ts). */
export function GET(req: Request) {
  return Response.json(protectedResourceMetadata(publicOrigin(req)), {
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" },
  });
}

export const OPTIONS = preflight;
