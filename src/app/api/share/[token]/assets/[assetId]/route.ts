import fs from "node:fs";
import { assetFilePath, getAsset } from "@/server/assets";
import { SHARED_SIZES, sharedAssetAllowed } from "@/server/services/shares";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; assetId: string }> };

const gone = () => Response.json({ error: { code: "not_found", message: "Lien expiré ou invalide." } }, { status: 404 });

/** An image of a shared book, for a visitor without an account: cover and illustrations, screen sizes only (ADR-0009). */
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { token, assetId } = await ctx.params;
  if (!sharedAssetAllowed(token, assetId)) return gone();
  const asked = new URL(req.url).searchParams.get("size");
  const size = SHARED_SIZES.find((s) => s === asked) ?? "web";
  const { file, mime } = assetFilePath(getAsset(assetId), size);
  if (!fs.existsSync(file)) return gone();
  const data = fs.readFileSync(file);
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": mime, "Content-Length": String(data.length), "Cache-Control": "private, max-age=3600" },
  });
}
