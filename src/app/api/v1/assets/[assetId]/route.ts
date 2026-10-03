import fs from "node:fs";
import { assetFilePath, getAsset, type AssetSize } from "@/server/assets";
import { api, errorResponse } from "@/server/http";
import { verifyAssetSignature } from "@/server/signing";
import { notFound } from "@/server/util";

type P = { assetId: string };

const SIZES: AssetSize[] = ["original", "print", "web", "thumb"];

function serve(assetId: string, asked: string | null, cache: string): Response {
  const size = asked && SIZES.includes(asked as AssetSize) ? (asked as AssetSize) : "original";
  const asset = getAsset(assetId);
  const { file, mime } = assetFilePath(asset, size);
  if (!fs.existsSync(file)) throw notFound("Fichier");
  const data = fs.readFileSync(file);
  const ext = mime.split("/")[1] ?? asset.ext;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(data.length),
      "Cache-Control": cache,
      "Content-Disposition": `inline; filename="${asset.id}-${size}.${ext}"`,
    },
  });
}

const authenticated = api<P>("read", ({ req, params }) =>
  // Asset ids never change content: cached for a year in the browser.
  serve(params.assetId, new URL(req.url).searchParams.get("size"), "private, max-age=31536000, immutable"),
);

/** With `exp` + `sig` (temporary link, ADR-0006), no key is needed; otherwise a session or a key. */
export async function GET(req: Request, ctx: { params: Promise<P> }): Promise<Response> {
  const url = new URL(req.url);
  const sig = url.searchParams.get("sig");
  if (!sig) return authenticated(req, ctx);
  try {
    const { assetId } = await ctx.params;
    const size = url.searchParams.get("size") ?? "original";
    if (!verifyAssetSignature(assetId, size, Number(url.searchParams.get("exp")), sig)) {
      return Response.json({ error: { code: "expired", message: "Lien expiré ou invalide." } }, { status: 403 });
    }
    return serve(assetId, size, "private, max-age=3600");
  } catch (err) {
    return errorResponse(err);
  }
}
