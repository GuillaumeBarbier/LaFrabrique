import { api, parseJson } from "@/server/http";
import { characterImageSchema, removeCharacterImage, updateCharacterImage } from "@/server/services/characters";

type P = { bookId: string; characterId: string; imageId: string };

export const PATCH = api<P>("write", async ({ req, actor, params }) =>
  updateCharacterImage(params.bookId, params.characterId, params.imageId, await parseJson(req, characterImageSchema), actor),
);

export const DELETE = api<P>("write", ({ actor, params }) => removeCharacterImage(params.bookId, params.characterId, params.imageId, actor));
