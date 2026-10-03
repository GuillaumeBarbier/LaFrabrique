import { z } from "zod";
import { api, parseJson } from "@/server/http";
import { deleteComment, setCommentResolved } from "@/server/services/comments";

type P = { commentId: string };

const schema = z.object({ resolved: z.boolean() }).strict();

export const PATCH = api<P>("write", async ({ req, actor, params }) => {
  const { resolved } = await parseJson(req, schema);
  return setCommentResolved(params.commentId, resolved, actor);
});

export const DELETE = api<P>("human", ({ actor, params }) => {
  deleteComment(params.commentId, actor);
});
