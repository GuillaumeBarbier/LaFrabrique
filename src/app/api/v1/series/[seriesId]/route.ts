import { api, parseJson } from "@/server/http";
import { getSeries, updateSeries, updateSeriesSchema } from "@/server/services/series";

type P = { seriesId: string };

export const GET = api<P>("read", ({ params }) => getSeries(params.seriesId));

export const PATCH = api<P>("write", async ({ req, actor, params }) =>
  updateSeries(params.seriesId, await parseJson(req, updateSeriesSchema), actor).series,
);
