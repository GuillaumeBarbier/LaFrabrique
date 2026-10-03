import { FONT_CATALOG, FONT_CATEGORY_LABELS } from "@/lib/fonts";
import { api } from "@/server/http";
import { listCustomFonts, uploadFont } from "@/server/services/fonts";
import { badRequest } from "@/server/util";

/** Every font a book can use: the pre-installed catalogue and the uploaded ones. */
export const GET = api("read", () => ({
  catalog: FONT_CATALOG.map((f) => ({ ...f, categoryLabel: FONT_CATEGORY_LABELS[f.category] })),
  custom: listCustomFonts(),
}));

export const POST = api("human", async ({ req, actor }) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Champ « file » manquant.");
  const name = form.get("name");
  const font = uploadFont(Buffer.from(await file.arrayBuffer()), file.name, typeof name === "string" ? name : null, actor);
  return Response.json(font, { status: 201 });
});
