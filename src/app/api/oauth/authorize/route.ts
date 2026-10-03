import { z } from "zod";
import { api, parseJson, publicOrigin } from "@/server/http";
import { approveAuthorization, denyAuthorization, validateAuthorizationRequest } from "@/server/oauth/flow";
import { badRequest } from "@/server/util";

const schema = z
  .object({
    params: z.record(z.string(), z.string()),
    decision: z.enum(["allow", "deny"]),
    name: z.string().trim().max(60).optional(),
    scope: z.enum(["read", "write"]).optional(),
  })
  .strict();

/** The owner's answer on the consent screen: where to send the browser next. */
export const POST = api("human", async ({ req }) => {
  const input = await parseJson(req, schema);
  const result = await validateAuthorizationRequest(input.params, publicOrigin(req));
  if (!result.ok) {
    if (result.redirect) return { redirect: result.redirect };
    throw badRequest(result.description);
  }
  if (input.decision === "deny") return { redirect: denyAuthorization(result.request) };
  return {
    redirect: approveAuthorization(result.request, {
      name: input.name || result.client.name,
      scope: input.scope ?? result.request.requestedScope,
    }),
  };
});
