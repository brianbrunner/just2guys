import { getRequestEnv } from "../lib/server";
import { getFreshness } from "../../server/domain/queries";
import type { Route } from "./+types/health";

export async function loader({ context }: Route.LoaderArgs) {
  const env = getRequestEnv(context);
  const [freshness, season] = await Promise.all([
    getFreshness(env.DB),
    env.DB.prepare("SELECT year, status FROM seasons WHERE year=?")
      .bind(Number(env.ACTIVE_SEASON))
      .first<{
        year: number;
        status: string;
      }>(),
  ]);
  const degraded = (freshness?.consecutiveFailures ?? 0) >= 3;
  const inSeason = season?.status === "in_season";
  const stale = Boolean(
    inSeason &&
    (!freshness?.finished_at ||
      Date.now() - Date.parse(freshness.finished_at) >
        Number(env.STALE_AFTER_SECONDS) * 1000),
  );
  const ok = Boolean(season) && (!inSeason || (!degraded && !stale));
  return Response.json(
    {
      ok,
      activeSeason: season ?? null,
      lastSuccessfulSync: freshness,
      degraded,
      stale,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
