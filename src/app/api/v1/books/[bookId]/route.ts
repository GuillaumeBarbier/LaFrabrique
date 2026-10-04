import { getFormat, requiredPixels } from "@/lib/book";
import { api, parseJson } from "@/server/http";
import { deleteBook, getBook, updateBook, updateBookSchema } from "@/server/services/books";
import { BOOK_SECTIONS, presentBook, type BookSection } from "@/server/services/present";

type P = { bookId: string };

/** The whole book; `?summary=1` and/or `?include=brief,rules,typography,spreads,characters` for a light view. */
export const GET = api<P>("read", ({ req, params }) => {
  const book = getBook(params.bookId);
  const url = new URL(req.url);
  const include = url.searchParams.get("include")?.split(",").filter((s): s is BookSection => (BOOK_SECTIONS as readonly string[]).includes(s));
  const summary = url.searchParams.get("summary") === "1";
  if (summary || include) return presentBook(book, { include, summary });
  return { ...book, printPixels: requiredPixels(getFormat(book.format)) };
});

export const PATCH = api<P>("write", async ({ req, actor, params }) => {
  return updateBook(params.bookId, await parseJson(req, updateBookSchema), actor);
});

export const DELETE = api<P>("human", ({ actor, params }) => {
  deleteBook(params.bookId, actor);
});
