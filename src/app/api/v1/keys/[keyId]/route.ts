import { revokeApiKey } from "@/server/auth/api-keys";
import { api } from "@/server/http";

export const DELETE = api<{ keyId: string }>("human", ({ params }) => {
  revokeApiKey(params.keyId);
});
