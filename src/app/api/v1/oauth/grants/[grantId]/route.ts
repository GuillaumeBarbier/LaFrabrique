import { api } from "@/server/http";
import { revokeConnection } from "@/server/oauth/flow";
import { notFound } from "@/server/util";

export const DELETE = api<{ grantId: string }>("human", ({ params }) => {
  if (!revokeConnection(params.grantId)) throw notFound("Connexion");
});
