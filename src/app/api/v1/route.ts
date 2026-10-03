import { AGENT_GUIDE } from "@/server/agent-guide";
import { api, publicOrigin } from "@/server/http";

/** Self-description for agents: where things are and how to work. */
export const GET = api("read", ({ req }) => {
  const origin = publicOrigin(req);
  return {
    name: "La Fabrique",
    version: 1,
    mcp: `${origin}/api/mcp`,
    endpoints: [
      "GET    /api/v1/me",
      "GET    /api/v1/formats",
      "GET    /api/v1/requests?to=agent",
      "GET    /api/v1/books?filter=all|active|done|archived&q=",
      "POST   /api/v1/books",
      "GET    /api/v1/books/{bookId}",
      "PATCH  /api/v1/books/{bookId}",
      "PUT    /api/v1/books/{bookId}/cover            (multipart file | image/* | JSON {base64|url})",
      "DELETE /api/v1/books/{bookId}/cover",
      "POST   /api/v1/books/{bookId}/spreads",
      "PUT    /api/v1/books/{bookId}/spreads           ({ order: [spreadId…] })",
      "GET    /api/v1/books/{bookId}/spreads/{spreadId}",
      "PATCH  /api/v1/books/{bookId}/spreads/{spreadId}",
      "DELETE /api/v1/books/{bookId}/spreads/{spreadId}",
      "PUT    /api/v1/books/{bookId}/spreads/{spreadId}/illustration",
      "DELETE /api/v1/books/{bookId}/spreads/{spreadId}/illustration",
      "GET    /api/v1/books/{bookId}/comments?spreadId=&open=1",
      "POST   /api/v1/books/{bookId}/comments",
      "PATCH  /api/v1/comments/{commentId}             ({ resolved: boolean })",
      "GET    /api/v1/books/{bookId}/activity?spreadId=",
      "POST   /api/v1/activity/{activityId}/restore",
      "GET    /api/v1/books/{bookId}/events           (text/event-stream)",
      "GET    /api/v1/assets/{assetId}?size=original|web|thumb",
      "GET    /api/v1/fonts",
    ],
    guide: AGENT_GUIDE,
  };
});
