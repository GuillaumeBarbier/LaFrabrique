import { api, publicOrigin } from "@/server/http";
import { characterReferences } from "@/server/services/characters";

type P = { bookId: string };

/**
 * References for illustrating: the characters of a spread (`?spreadId=`), or some
 * (`?characterIds=a,b`), or all, filtered by view (`?views=front,back,expression`), with the
 * illustration style and links an image generator can download for 24 h.
 */
export const GET = api<P>("read", ({ req, params }) => {
  const url = new URL(req.url);
  const list = (name: string) => url.searchParams.get(name)?.split(",").filter(Boolean);
  return characterReferences(
    { bookId: params.bookId },
    { origin: publicOrigin(req), spreadId: url.searchParams.get("spreadId"), characterIds: list("characterIds"), views: list("views") },
  );
});
