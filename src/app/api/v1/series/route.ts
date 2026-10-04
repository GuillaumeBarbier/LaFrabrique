import { api, parseJson } from "@/server/http";
import { createSeries, createSeriesSchema, listSeries } from "@/server/services/series";

export const GET = api("read", ({ req }) => ({ series: listSeries(new URL(req.url).searchParams.get("archived") === "1") }));

/** A new series; with `fromBookId`, that book becomes its model (its characters move up to the series). */
export const POST = api("write", async ({ req, actor }) => {
  const { series, movedCharacters } = createSeries(await parseJson(req, createSeriesSchema), actor);
  return Response.json({ ...series, movedCharacters }, { status: 201 });
});
