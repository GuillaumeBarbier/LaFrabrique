import { z } from "zod";
import { api, parseJson } from "@/server/http";
import { deleteFont, renameFont } from "@/server/services/fonts";

type P = { fontId: string };

export const PATCH = api<P>("human", async ({ req, params }) => {
  const { name } = await parseJson(req, z.object({ name: z.string().min(1).max(60) }).strict());
  return renameFont(params.fontId, name);
});

export const DELETE = api<P>("human", ({ params }) => {
  deleteFont(params.fontId);
});
