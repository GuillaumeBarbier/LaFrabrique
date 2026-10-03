import { z } from "zod";
import { changePassword } from "@/server/auth/users";
import { api, parseJson } from "@/server/http";

const schema = z.object({ current: z.string().max(200), next: z.string().max(200) }).strict();

export const POST = api("human", async ({ req, actor }) => {
  const { current, next } = await parseJson(req, schema);
  changePassword(actor.userId as string, current, next);
});
