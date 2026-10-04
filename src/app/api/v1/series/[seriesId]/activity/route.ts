import { api } from "@/server/http";
import { listActivity } from "@/server/services/activity";
import { getSeriesRow } from "@/server/services/series";

type P = { seriesId: string };

export const GET = api<P>("read", ({ req, params }) => {
  getSeriesRow(params.seriesId);
  const url = new URL(req.url);
  return {
    activity: listActivity(
      { seriesId: params.seriesId },
      { characterId: url.searchParams.get("characterId") ?? undefined, limit: Number(url.searchParams.get("limit") ?? 100) },
    ),
  };
});
