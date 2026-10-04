import { readImageInput, storeImage } from "@/server/assets";
import { api } from "@/server/http";
import { getSpread, setIllustration } from "@/server/services/books";
import { setIllustrationFromUpload } from "@/server/services/uploads";

type P = { bookId: string; spreadId: string };

/** multipart `file`, raw image/*, or JSON { uploadId | base64 | url }. */
export const PUT = api<P>("write", async ({ req, actor, params }) => {
  getSpread(params.bookId, params.spreadId);
  const input = await readImageInput(req);
  if ("uploadId" in input) {
    setIllustrationFromUpload(params.bookId, params.spreadId, input.uploadId, actor);
    return getSpread(params.bookId, params.spreadId);
  }
  const asset = await storeImage(input.buffer, { kind: "illustration", bookId: params.bookId, originalName: input.name, actor });
  return setIllustration(params.bookId, params.spreadId, asset, actor);
});

export const DELETE = api<P>("write", ({ actor, params }) => setIllustration(params.bookId, params.spreadId, null, actor));
