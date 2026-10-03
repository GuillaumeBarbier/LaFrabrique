import { api } from "@/server/http";
import { listActivity } from "@/server/services/activity";
import { getBook } from "@/server/services/books";

type P = { bookId: string };

export const GET = api<P>("read", ({ req, params }) => {
  getBook(params.bookId);
  const url = new URL(req.url);
  return {
    activity: listActivity(params.bookId, {
      spreadId: url.searchParams.get("spreadId") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 100),
    }),
  };
});
