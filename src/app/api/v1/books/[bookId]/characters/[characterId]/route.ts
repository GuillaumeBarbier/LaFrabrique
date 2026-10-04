import { api, parseJson } from "@/server/http";
import { characterOfBook, deleteCharacter, getCharacter, updateCharacter, updateCharacterSchema } from "@/server/services/characters";

type P = { bookId: string; characterId: string };

// The book's own characters and those of its series (shared: a change shows in every book of the series).

export const GET = api<P>("read", ({ params }) => getCharacter(characterOfBook(params.bookId, params.characterId).id));

export const PATCH = api<P>("write", async ({ req, actor, params }) => {
  characterOfBook(params.bookId, params.characterId);
  return updateCharacter(params.characterId, await parseJson(req, updateCharacterSchema), actor).character;
});

export const DELETE = api<P>("write", ({ actor, params }) => {
  characterOfBook(params.bookId, params.characterId);
  deleteCharacter(params.characterId, actor);
});
