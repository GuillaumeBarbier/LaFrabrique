import { api, parseJson } from "@/server/http";
import { createCharacterSchema, listOwnerCharacters, reorderCharacters, reorderCharactersSchema } from "@/server/services/characters";
import { createCharacterWithUploads } from "@/server/services/uploads";

type P = { seriesId: string };

/** Characters shared by every book of the series. */
export const GET = api<P>("read", ({ params }) => ({ characters: listOwnerCharacters({ seriesId: params.seriesId }) }));

export const POST = api<P>("write", async ({ req, actor, params }) => {
  const character = createCharacterWithUploads({ seriesId: params.seriesId }, await parseJson(req, createCharacterSchema), actor);
  return Response.json(character, { status: 201 });
});

/** New order: { order: [characterId…] } (ids not given keep their order after). */
export const PUT = api<P>("write", async ({ req, actor, params }) => ({
  characters: reorderCharacters({ seriesId: params.seriesId }, (await parseJson(req, reorderCharactersSchema)).order, actor),
}));
