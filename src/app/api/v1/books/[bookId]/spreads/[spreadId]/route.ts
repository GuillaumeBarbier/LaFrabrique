import { api, parseJson } from "@/server/http";
import { deleteSpread, getSpread, updateSpread, updateSpreadSchema } from "@/server/services/books";

type P = { bookId: string; spreadId: string };

export const GET = api<P>("read", ({ params }) => getSpread(params.bookId, params.spreadId));

export const PATCH = api<P>("write", async ({ req, actor, params }) => {
  return updateSpread(params.bookId, params.spreadId, await parseJson(req, updateSpreadSchema), actor);
});

export const DELETE = api<P>("write", ({ actor, params }) => {
  deleteSpread(params.bookId, params.spreadId, actor);
});
