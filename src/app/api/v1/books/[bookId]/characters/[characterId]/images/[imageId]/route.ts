import { api, parseJson } from "@/server/http";
import { characterImageSchema, characterOfBook, removeCharacterImage, updateCharacterImage } from "@/server/services/characters";

type P = { bookId: string; characterId: string; imageId: string };

export const PATCH = api<P>("write", async ({ req, actor, params }) => {
  characterOfBook(params.bookId, params.characterId);
  return updateCharacterImage(params.characterId, params.imageId, await parseJson(req, characterImageSchema), actor).character;
});

export const DELETE = api<P>("write", ({ actor, params }) => {
  characterOfBook(params.bookId, params.characterId);
  return removeCharacterImage(params.characterId, params.imageId, actor);
});
