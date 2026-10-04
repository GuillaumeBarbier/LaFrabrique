import { api, parseJson, publicOrigin } from "@/server/http";
import { createUploads, createUploadsSchema } from "@/server/services/uploads";

/**
 * Asks for single-use upload URLs (15 min, no key needed to send): then
 * `curl -T file "<uploadUrl>"`, then POST /api/v1/uploads/commit (ADR-0008).
 */
export const POST = api("write", async ({ req, actor }) => {
  const input = await parseJson(req, createUploadsSchema);
  return Response.json(createUploads(input, actor, publicOrigin(req)), { status: 201 });
});
