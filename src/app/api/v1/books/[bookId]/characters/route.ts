import { api, parseJson } from "@/server/http";
import { getBook } from "@/server/services/books";
import { createCharacter, createCharacterSchema, listCharacters } from "@/server/services/characters";

type P = { bookId: string };

export const GET = api<P>("read", ({ params }) => {
  getBook(params.bookId);
  return { characters: listCharacters(params.bookId) };
});

export const POST = api<P>("write", async ({ req, actor, params }) => {
  const character = createCharacter(params.bookId, await parseJson(req, createCharacterSchema), actor);
  return Response.json(character, { status: 201 });
});
