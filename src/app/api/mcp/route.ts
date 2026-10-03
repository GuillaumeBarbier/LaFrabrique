import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { publicOrigin, resolveActor } from "@/server/http";
import { wwwAuthenticate } from "@/server/oauth/metadata";
import { buildMcpServer } from "@/server/mcp";

export const dynamic = "force-dynamic";

// Streamable HTTP, stateless: each request gets its own server bound to the caller's key.
// Bodies up to 60 MB, for illustrations sent in base64.

async function handle(req: Request): Promise<Response> {
  const actor = resolveActor(req);
  if (!actor) {
    // A 401 with resource_metadata starts the OAuth sign-in of connectors (claude.ai…);
    // a key holder just sends Authorization: Bearer lfab_….
    const presented = req.headers.get("authorization")?.toLowerCase().startsWith("bearer ");
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Connexion requise : OAuth ou clé API (Authorization: Bearer lfab_…)." }, id: null },
      { status: 401, headers: { "WWW-Authenticate": wwwAuthenticate(publicOrigin(req), presented ? "invalid_token" : undefined) } },
    );
  }
  const server = buildMcpServer(actor, publicOrigin(req));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 60 * 1024 * 1024,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // JSON mode: the response is complete once handleRequest resolves.
    void server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
