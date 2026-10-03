import { z } from "zod";
import { createApiKey, listApiKeys } from "@/server/auth/api-keys";
import { api, parseJson } from "@/server/http";

export const GET = api("human", () => ({ keys: listApiKeys() }));

const schema = z.object({ name: z.string().trim().min(1).max(60), scope: z.enum(["read", "write"]) }).strict();

/** The clear key is in this response only (ADR-0002). */
export const POST = api("human", async ({ req }) => {
  const { name, scope } = await parseJson(req, schema);
  return Response.json(createApiKey(name, scope), { status: 201 });
});
