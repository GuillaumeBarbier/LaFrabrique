import fs from "node:fs";
import { api } from "@/server/http";
import { fontFile } from "@/server/services/fonts";

type P = { fontId: string };

export const GET = api<P>("read", ({ params }) => {
  const { file, mime } = fontFile(params.fontId);
  const data = fs.readFileSync(file);
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
});
