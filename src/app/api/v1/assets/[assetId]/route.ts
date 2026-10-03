import fs from "node:fs";
import { assetFilePath, getAsset, type AssetSize } from "@/server/assets";
import { api } from "@/server/http";
import { notFound } from "@/server/util";

type P = { assetId: string };

const SIZES: AssetSize[] = ["original", "print", "web", "thumb"];

/** Asset ids never change content: cached for a year in the browser. */
export const GET = api<P>("read", ({ req, params }) => {
  const asked = new URL(req.url).searchParams.get("size") as AssetSize | null;
  const size = asked && SIZES.includes(asked) ? asked : "original";
  const asset = getAsset(params.assetId);
  const { file, mime } = assetFilePath(asset, size);
  if (!fs.existsSync(file)) throw notFound("Fichier");
  const data = fs.readFileSync(file);
  const ext = mime.split("/")[1] ?? asset.ext;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${asset.id}-${size}.${ext}"`,
    },
  });
});
