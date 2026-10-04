import { api, parseJson, publicOrigin } from "@/server/http";
import { createShare, createShareSchema, listShares } from "@/server/services/shares";

type P = { bookId: string };

/** The book's reading links. Agents see who it is shared with, not the links (ADR-0009). */
export const GET = api<P>("read", ({ req, actor, params }) => ({
  shares: listShares(params.bookId, actor.type === "human" ? publicOrigin(req) : null),
}));

/** A new reading link: { label?, expiresInDays? }. Humans only, like the keys. */
export const POST = api<P>("human", async ({ req, actor, params }) => {
  const share = createShare(params.bookId, await parseJson(req, createShareSchema), actor, publicOrigin(req));
  return Response.json(share, { status: 201 });
});
