import { readImageUpload, storeImage } from "@/server/assets";
import { api } from "@/server/http";
import { addCharacterImage, characterImageSchema, getCharacter } from "@/server/services/characters";

type P = { bookId: string; characterId: string };

/** A reference image: multipart `file` (+ `label`, `primary`), raw image/*, or JSON { base64 | url, label?, primary? }. */
export const POST = api<P>("write", async ({ req, actor, params }) => {
  getCharacter(params.bookId, params.characterId);
  const { buffer, name, fields } = await readImageUpload(req);
  const input = characterImageSchema.parse({
    label: typeof fields.label === "string" ? fields.label : undefined,
    primary: fields.primary === true || fields.primary === "true" ? true : undefined,
  });
  const asset = await storeImage(buffer, { kind: "character", bookId: params.bookId, originalName: name, actor });
  return Response.json(addCharacterImage(params.bookId, params.characterId, asset, input, actor), { status: 201 });
});
