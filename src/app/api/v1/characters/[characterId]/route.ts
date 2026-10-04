import { api, parseJson } from "@/server/http";
import { deleteCharacter, getCharacter, updateCharacter, updateCharacterSchema } from "@/server/services/characters";

type P = { characterId: string };

// A character by its id alone, whether it belongs to a book or to a series.

export const GET = api<P>("read", ({ params }) => getCharacter(params.characterId));

export const PATCH = api<P>("write", async ({ req, actor, params }) =>
  updateCharacter(params.characterId, await parseJson(req, updateCharacterSchema), actor).character,
);

export const DELETE = api<P>("write", ({ actor, params }) => {
  deleteCharacter(params.characterId, actor);
});
