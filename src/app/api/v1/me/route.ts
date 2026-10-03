import { api } from "@/server/http";

export const GET = api("read", ({ actor }) => ({ type: actor.type, name: actor.name, scope: actor.scope }));
