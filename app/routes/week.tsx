import { Link } from "react-router";

import { LiveScoreboard } from "../components/live-scoreboard";
import { PageHeader } from "../components/page-header";
import { getRequestEnv } from "../lib/server";
import { getWeekPage } from "../../server/domain/queries";
import type { Route } from "./+types/week";

export async function loader({ params, context }: Route.LoaderArgs) {
  const year = Number(params.year);
  const week = Number(params.week);
  if (!Number.isInteger(year) || !Number.isInteger(week))
    throw new Response("Week not found", { status: 404 });
  const env = getRequestEnv(context);
  const page = await getWeekPage(env.DB, year, week);
  if (!page || week < 1 || week > page.season.final_week)
    throw new Response("Week not found", { status: 404 });
  return {
    ...page,
    staleAfterSeconds: Number(env.STALE_AFTER_SECONDS),
  };
}

export default function Week({ loaderData }: Route.ComponentProps) {
  const { season, week, matchups, freshness } = loaderData;
  return (
    <main className="wrap page">
      <PageHeader
        eyebrow={`${season.name} · ${season.year}`}
        title={`Week ${week}`}
        description="Final scores are preserved exactly as reported, except for visible reviewed corrections."
      />
      <div className="week-pager">
        <Link to={`/seasons/${season.year}/weeks/${Math.max(1, week - 1)}`}>
          ← Previous
        </Link>
        <Link to={`/seasons/${season.year}`}>Season overview</Link>
        <Link
          to={`/seasons/${season.year}/weeks/${Math.min(season.final_week, week + 1)}`}
        >
          Next →
        </Link>
      </div>
      <LiveScoreboard
        initialMatchups={matchups}
        initialFreshness={freshness}
        endpoint={`/api/seasons/${season.year}/weeks/${week}`}
        poll={season.status === "in_season"}
        staleAfterSeconds={loaderData.staleAfterSeconds}
      />
    </main>
  );
}
