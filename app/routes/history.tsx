import { Link } from "react-router";

import { HistoryNav } from "../components/history-nav";
import { PageHeader } from "../components/page-header";
import { getRequestEnv } from "../lib/server";
import { getHistoryTimeline } from "../../server/domain/history";
import type { Route } from "./+types/history";

export function meta() {
  return [{ title: "League History — Just 2 Guys" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  return getHistoryTimeline(getRequestEnv(context).DB);
}

export default function History({ loaderData }: Route.ComponentProps) {
  return (
    <main className="wrap page">
      <PageHeader eyebrow="2013 to now" title="League history" />
      <HistoryNav />
      <div className="history-feature-grid">
        <Link to="/history/all-play">
          <strong>All-play standings</strong>
          <span>Every score against every score.</span>
        </Link>
        <Link to="/history/drafts">
          <strong>Draft archive</strong>
          <span>1,068 picks from the Sleeper era.</span>
        </Link>
        <Link to="/history/transactions">
          <strong>Transaction wire</strong>
          <span>Trades, waivers, and free agents.</span>
        </Link>
        <Link to="/history/team-names">
          <strong>Team-name museum</strong>
          <span>Every identity managers brought to the league.</span>
        </Link>
      </div>
      <ol className="league-timeline">
        {loaderData.map((season) => (
          <li key={season.id}>
            <div className="timeline-year">{season.year}</div>
            <article>
              <div className="timeline-heading">
                <h2>
                  <Link to={`/seasons/${season.year}`}>{season.name}</Link>
                </h2>
                <span>
                  {season.team_count} teams ·{" "}
                  {season.sources.some(
                    (source) => source.provider === "sleeper",
                  )
                    ? "Sleeper"
                    : "Yahoo"}
                </span>
              </div>
              <p>{season.story}</p>
              {season.champion_manager ? (
                <dl>
                  <div>
                    <dt>Champion</dt>
                    <dd>{season.champion_manager}</dd>
                  </div>
                  <div>
                    <dt>Last</dt>
                    <dd>{season.last_place_manager}</dd>
                  </div>
                </dl>
              ) : (
                <span className="timeline-pending">
                  {season.status.replaceAll("_", " ")}
                </span>
              )}
            </article>
          </li>
        ))}
      </ol>
    </main>
  );
}
