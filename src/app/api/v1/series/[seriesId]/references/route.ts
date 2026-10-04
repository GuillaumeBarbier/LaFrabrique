import { api, publicOrigin } from "@/server/http";
import { characterReferences } from "@/server/services/characters";

type P = { seriesId: string };

/** The series' characters with their references and its illustration style (`?characterIds=a,b&views=front,back`). */
export const GET = api<P>("read", ({ req, params }) => {
  const url = new URL(req.url);
  const list = (name: string) => url.searchParams.get(name)?.split(",").filter(Boolean);
  return characterReferences({ seriesId: params.seriesId }, { origin: publicOrigin(req), characterIds: list("characterIds"), views: list("views") });
});
