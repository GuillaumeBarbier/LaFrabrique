import { deleteOtherSessions, SESSION_COOKIE } from "@/server/auth/users";
import { api } from "@/server/http";

/** Signs out every other browser. */
export const DELETE = api("human", ({ req, actor }) => {
  const token = req.headers.get("cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
  return { closed: deleteOtherSessions(actor.userId as string, token ? decodeURIComponent(token) : undefined) };
});
