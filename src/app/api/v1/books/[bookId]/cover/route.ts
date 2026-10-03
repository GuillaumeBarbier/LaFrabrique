import { readImageUpload, storeImage } from "@/server/assets";
import { api } from "@/server/http";
import { getBook, setCover } from "@/server/services/books";

type P = { bookId: string };

export const PUT = api<P>("write", async ({ req, actor, params }) => {
  getBook(params.bookId);
  const { buffer, name } = await readImageUpload(req);
  const asset = await storeImage(buffer, { kind: "cover", bookId: params.bookId, originalName: name, actor });
  return setCover(params.bookId, asset, actor);
});

export const DELETE = api<P>("write", ({ actor, params }) => setCover(params.bookId, null, actor));
