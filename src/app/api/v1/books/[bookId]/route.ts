import { getFormat, requiredPixels } from "@/lib/book";
import { api, parseJson } from "@/server/http";
import { deleteBook, getBook, updateBook, updateBookSchema } from "@/server/services/books";

type P = { bookId: string };

export const GET = api<P>("read", ({ params }) => {
  const book = getBook(params.bookId);
  return { ...book, printPixels: requiredPixels(getFormat(book.format)) };
});

export const PATCH = api<P>("write", async ({ req, actor, params }) => {
  return updateBook(params.bookId, await parseJson(req, updateBookSchema), actor);
});

export const DELETE = api<P>("human", ({ actor, params }) => {
  deleteBook(params.bookId, actor);
});
