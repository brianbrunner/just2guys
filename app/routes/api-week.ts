import { getRequestEnv } from "../lib/server";
import { getWeekPage } from "../../server/domain/queries";
import { contentHash } from "../../server/sleeper/client";
import type { Route } from "./+types/api-week";

export async function loader({ params, context, request }: Route.LoaderArgs) {
  const year = Number(params.year);
  const week = Number(params.week);
  const page = await getWeekPage(getRequestEnv(context).DB, year, week);
  if (!page) return Response.json({ error: "Not found" }, { status: 404 });
  const body = JSON.stringify({
    matchups: page.matchups,
    freshness: page.freshness,
  });
  const etag = `"${(await contentHash(body)).slice(0, 24)}"`;
  if (request.headers.get("If-None-Match") === etag)
    return new Response(null, { status: 304, headers: { ETag: etag } });
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control":
        "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
      ETag: etag,
    },
  });
}
