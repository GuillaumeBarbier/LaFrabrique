import { api } from "@/server/http";
import { checkText } from "@/server/services/text-check";

type P = { bookId: string };

/** The book's writing rules applied to its pages (`?spreadId=`, `?min=error|warning|info`). */
export const GET = api<P>("read", ({ req, params }) => {
  const url = new URL(req.url);
  const min = url.searchParams.get("min");
  return checkText(params.bookId, {
    spreadId: url.searchParams.get("spreadId") ?? undefined,
    minSeverity: min === "error" || min === "warning" ? min : "info",
  });
});
