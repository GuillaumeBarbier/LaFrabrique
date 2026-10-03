import { api, parseJson } from "@/server/http";
import { getBook } from "@/server/services/books";
import { createComment, createCommentSchema, listComments } from "@/server/services/comments";

type P = { bookId: string };

export const GET = api<P>("read", ({ req, params }) => {
  getBook(params.bookId);
  const url = new URL(req.url);
  return {
    comments: listComments(params.bookId, {
      spreadId: url.searchParams.get("spreadId") ?? undefined,
      openOnly: url.searchParams.get("open") === "1",
    }),
  };
});

export const POST = api<P>("write", async ({ req, actor, params }) => {
  const comment = createComment(params.bookId, await parseJson(req, createCommentSchema), actor);
  return Response.json(comment, { status: 201 });
});
