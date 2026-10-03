import { api } from "@/server/http";
import { listOpenRequests } from "@/server/services/comments";

/** Open requests addressed to the agent (default) or to the human, across books. */
export const GET = api("read", ({ req }) => {
  const url = new URL(req.url);
  const to = url.searchParams.get("to") === "human" ? "human" : "agent";
  return { requests: listOpenRequests(to, url.searchParams.get("bookId") ?? undefined) };
});
