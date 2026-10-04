import { imageFields, readImageInput, storeImage } from "@/server/assets";
import { api } from "@/server/http";
import { addCharacterImage, characterImageSchema, characterRow } from "@/server/services/characters";
import { addCharacterImageFromUpload } from "@/server/services/uploads";

type P = { characterId: string };

/** A reference image: JSON { uploadId | base64 | url, label?, view?, primary? }, multipart `file`, or raw image/*. */
export const POST = api<P>("write", async ({ req, actor, params }) => {
  const c = characterRow(params.characterId);
  const input = await readImageInput(req);
  const fields = characterImageSchema.parse(imageFields(input.fields));
  if ("uploadId" in input) {
    return Response.json(addCharacterImageFromUpload(params.characterId, input.uploadId, fields, actor), { status: 201 });
  }
  const asset = await storeImage(input.buffer, { kind: "character", bookId: c.book_id, originalName: input.name, actor });
  return Response.json(addCharacterImage(params.characterId, asset, fields, actor), { status: 201 });
});
