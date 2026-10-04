import { imageFields, readImageInput, storeImage } from "@/server/assets";
import { api } from "@/server/http";
import { addCharacterImage, characterImageSchema, characterOfBook, getCharacter } from "@/server/services/characters";
import { addCharacterImageFromUpload } from "@/server/services/uploads";

type P = { bookId: string; characterId: string };

/** A reference image: multipart `file` (+ `label`, `view`, `primary`), raw image/*, or JSON { uploadId | base64 | url, label?, view?, primary? }. */
export const POST = api<P>("write", async ({ req, actor, params }) => {
  const c = characterOfBook(params.bookId, params.characterId);
  const input = await readImageInput(req);
  const fields = characterImageSchema.parse(imageFields(input.fields));
  if ("uploadId" in input) {
    addCharacterImageFromUpload(c.id, input.uploadId, fields, actor);
    return Response.json(getCharacter(c.id), { status: 201 });
  }
  const asset = await storeImage(input.buffer, { kind: "character", bookId: c.book_id, originalName: input.name, actor });
  return Response.json(addCharacterImage(c.id, asset, fields, actor), { status: 201 });
});
