import { z } from "zod";
import { api, parseJson } from "@/server/http";
import { addSpread, createSpreadSchema, reorderSpreads } from "@/server/services/books";

type P = { bookId: string };

export const POST = api<P>("write", async ({ req, actor, params }) => {
  const spread = addSpread(params.bookId, await parseJson(req, createSpreadSchema), actor);
  return Response.json(spread, { status: 201 });
});

const orderSchema = z.object({ order: z.array(z.string()).max(200) }).strict();

export const PUT = api<P>("write", async ({ req, actor, params }) => {
  const { order } = await parseJson(req, orderSchema);
  return reorderSpreads(params.bookId, order, actor);
});
