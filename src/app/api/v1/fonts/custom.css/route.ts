import { api } from "@/server/http";
import { customFontsCss } from "@/server/services/fonts";

export const dynamic = "force-dynamic";

/** @font-face rules for the uploaded fonts, linked by every page that shows a book. */
export const GET = api("read", () => {
  return new Response(customFontsCss(), {
    headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "private, no-cache" },
  });
});
