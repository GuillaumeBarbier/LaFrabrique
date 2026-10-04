import { readImageInput, storeImage } from "@/server/assets";
import { api } from "@/server/http";
import { getBook, setCover } from "@/server/services/books";
import { setCoverFromUpload } from "@/server/services/uploads";

type P = { bookId: string };

/** multipart `file`, raw image/*, or JSON { uploadId | base64 | url }. */
export const PUT = api<P>("write", async ({ req, actor, params }) => {
  getBook(params.bookId);
  const input = await readImageInput(req);
  if ("uploadId" in input) {
    setCoverFromUpload(params.bookId, input.uploadId, actor);
    return getBook(params.bookId);
  }
  const asset = await storeImage(input.buffer, { kind: "cover", bookId: params.bookId, originalName: input.name, actor });
  return setCover(params.bookId, asset, actor);
});

export const DELETE = api<P>("write", ({ actor, params }) => setCover(params.bookId, null, actor));
