import { api } from "@/server/http";
import { listActivity } from "@/server/services/activity";
import { getBook } from "@/server/services/books";

type P = { bookId: string };

/** The book's history, with the changes made to its series (shared characters, style, rules). */
export const GET = api<P>("read", ({ req, params }) => {
  getBook(params.bookId);
  const url = new URL(req.url);
  return {
    activity: listActivity(
      { bookId: params.bookId },
      {
        spreadId: url.searchParams.get("spreadId") ?? undefined,
        characterId: url.searchParams.get("characterId") ?? undefined,
        limit: Number(url.searchParams.get("limit") ?? 100),
      },
    ),
  };
});
