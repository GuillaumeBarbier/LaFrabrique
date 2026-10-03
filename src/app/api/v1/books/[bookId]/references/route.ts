import { api, publicOrigin } from "@/server/http";
import { characterReferences } from "@/server/services/characters";

type P = { bookId: string };

/**
 * References for illustrating: the characters of a spread (`?spreadId=`), or some
 * (`?characterIds=a,b`), or all, with links an image generator can download for 24 h.
 */
export const GET = api<P>("read", ({ req, params }) => {
  const url = new URL(req.url);
  const ids = url.searchParams.get("characterIds");
  return characterReferences(params.bookId, {
    origin: publicOrigin(req),
    spreadId: url.searchParams.get("spreadId"),
    characterIds: ids ? ids.split(",").filter(Boolean) : undefined,
  });
});
