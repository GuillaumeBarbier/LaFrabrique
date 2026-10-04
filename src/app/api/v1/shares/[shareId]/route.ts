import { api } from "@/server/http";
import { revokeShare } from "@/server/services/shares";

type P = { shareId: string };

/** Revokes a reading link at once. Humans only. */
export const DELETE = api<P>("human", ({ actor, params }) => {
  revokeShare(params.shareId, actor);
});
