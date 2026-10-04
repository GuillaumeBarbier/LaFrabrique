import { contactSheet } from "@/server/contact-sheet";
import { api } from "@/server/http";

type P = { bookId: string };

/** The whole book on one JPEG: cover, then each spread (illustration | start of the text). `?size=large`. */
export const GET = api<P>("read", async ({ req, params }) => {
  const sheet = await contactSheet(params.bookId, new URL(req.url).searchParams.get("size") === "large" ? "large" : "small");
  return new Response(new Uint8Array(sheet.image), { headers: { "Content-Type": sheet.mimeType, "Cache-Control": "no-store" } });
});
