import { api } from "@/server/http";
import { getBook, restoreActivity } from "@/server/services/books";
import { getSeries } from "@/server/services/series";

type P = { activityId: string };

/**
 * Restores the state from before a history entry. Returns the book it touched — or the one
 * given by `?bookId=` for a series entry shown in a book's history — or else the series.
 */
export const POST = api<P>("write", ({ req, actor, params }) => {
  const { bookIds, seriesId } = restoreActivity(params.activityId, actor);
  const asked = new URL(req.url).searchParams.get("bookId");
  const bookId = asked && bookIds.includes(asked) ? asked : bookIds.length === 1 ? bookIds[0] : asked;
  if (bookId) return getBook(bookId);
  if (seriesId) return getSeries(seriesId);
  return { restored: params.activityId };
});
