import { api, parseJson } from "@/server/http";
import { characterImageSchema, removeCharacterImage, updateCharacterImage } from "@/server/services/characters";

type P = { characterId: string; imageId: string };

/** { label?, view?, primary?, position? } */
export const PATCH = api<P>("write", async ({ req, actor, params }) =>
  updateCharacterImage(params.characterId, params.imageId, await parseJson(req, characterImageSchema), actor).character,
);

export const DELETE = api<P>("write", ({ actor, params }) => removeCharacterImage(params.characterId, params.imageId, actor));
