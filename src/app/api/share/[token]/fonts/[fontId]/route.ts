import fs from "node:fs";
import { fontFile } from "@/server/services/fonts";
import { sharedFontAllowed } from "@/server/services/shares";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; fontId: string }> };

/** An uploaded font a shared book uses (title or text), for the visitor's browser. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { token, fontId } = await ctx.params;
  if (!sharedFontAllowed(token, fontId)) return new Response(null, { status: 404 });
  const { file, mime } = fontFile(fontId);
  return new Response(new Uint8Array(fs.readFileSync(file)), { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=86400" } });
}
