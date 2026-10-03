import { api, parseJson } from "@/server/http";
import { createBook, createBookSchema, listBooks, type LibraryFilter } from "@/server/services/books";

const FILTERS: LibraryFilter[] = ["all", "active", "done", "archived"];

export const GET = api("read", ({ req }) => {
  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") as LibraryFilter | null;
  return { books: listBooks(filter && FILTERS.includes(filter) ? filter : "all", url.searchParams.get("q") ?? "") };
});

export const POST = api("write", async ({ req, actor }) => {
  const input = await parseJson(req, createBookSchema);
  return Response.json(createBook(input, actor), { status: 201 });
});
