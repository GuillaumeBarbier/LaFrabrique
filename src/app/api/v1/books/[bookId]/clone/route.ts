import { api, parseJson } from "@/server/http";
import { cloneBookSchema, cloneBookSetup } from "@/server/services/books";

type P = { bookId: string };

/** A new book with this one's setup (series, format, typography, style, rules, own characters), no pages copied. */
export const POST = api<P>("write", async ({ req, actor, params }) => {
  const { book, copiedCharacters } = cloneBookSetup(params.bookId, await parseJson(req, cloneBookSchema), actor);
  return Response.json({ ...book, copiedCharacters }, { status: 201 });
});
