import { api, parseJson } from "@/server/http";
import { deleteCharacter, getCharacter, updateCharacter, updateCharacterSchema } from "@/server/services/characters";

type P = { bookId: string; characterId: string };

export const GET = api<P>("read", ({ params }) => getCharacter(params.bookId, params.characterId));

export const PATCH = api<P>("write", async ({ req, actor, params }) =>
  updateCharacter(params.bookId, params.characterId, await parseJson(req, updateCharacterSchema), actor),
);

export const DELETE = api<P>("write", ({ actor, params }) => {
  deleteCharacter(params.bookId, params.characterId, actor);
});
