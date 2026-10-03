import { api } from "@/server/http";
import { restoreActivity } from "@/server/services/books";

type P = { activityId: string };

export const POST = api<P>("write", ({ actor, params }) => restoreActivity(params.activityId, actor));
