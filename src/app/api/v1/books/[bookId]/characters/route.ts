import { api, parseJson } from "@/server/http";
import { createCharacterSchema, listCharacters, reorderCharacters, reorderCharactersSchema } from "@/server/services/characters";
import { createCharacterWithUploads } from "@/server/services/uploads";

type P = { bookId: string };

/** The series' characters (shared) then the book's own. */
export const GET = api<P>("read", ({ params }) => ({ characters: listCharacters(params.bookId) }));

/** { name, role?, appearance?, position?, sourceCharacterId?, images?: [{ uploadId, label?, view?, primary? }] } */
export const POST = api<P>("write", async ({ req, actor, params }) => {
  const character = createCharacterWithUploads({ bookId: params.bookId }, await parseJson(req, createCharacterSchema), actor);
  return Response.json(character, { status: 201 });
});

/** New order: { order: [characterId…] }; series and own characters are ordered within their group. */
export const PUT = api<P>("write", async ({ req, actor, params }) => ({
  characters: reorderCharacters({ bookId: params.bookId }, (await parseJson(req, reorderCharactersSchema)).order, actor),
}));
