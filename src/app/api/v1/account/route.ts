import { z } from "zod";
import { getUser, updateProfile } from "@/server/auth/users";
import { api, parseJson } from "@/server/http";

export const GET = api("human", ({ actor }) => getUser(actor.userId as string));

const schema = z.object({ name: z.string().trim().min(1).max(80), email: z.email().max(200) }).partial().strict();

export const PATCH = api("human", async ({ req, actor }) => updateProfile(actor.userId as string, await parseJson(req, schema)));
