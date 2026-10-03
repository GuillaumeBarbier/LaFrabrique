import { readImageUpload, storeImage } from "@/server/assets";
import { api } from "@/server/http";
import { getSpread, setIllustration } from "@/server/services/books";

type P = { bookId: string; spreadId: string };

export const PUT = api<P>("write", async ({ req, actor, params }) => {
  getSpread(params.bookId, params.spreadId);
  const { buffer, name } = await readImageUpload(req);
  const asset = await storeImage(buffer, { kind: "illustration", bookId: params.bookId, originalName: name, actor });
  return setIllustration(params.bookId, params.spreadId, asset, actor);
});

export const DELETE = api<P>("write", ({ actor, params }) => setIllustration(params.bookId, params.spreadId, null, actor));
