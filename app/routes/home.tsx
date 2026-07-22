import { Link } from "react-router";

import { LiveScoreboard } from "../components/live-scoreboard";
import { PageHeader } from "../components/page-header";
import { StandingsTable } from "../components/standings-table";
import { StatusPill } from "../components/status-pill";
import { getRequestEnv } from "../lib/server";
import { getHomePage } from "../../server/domain/queries";
import type { Route } from "./+types/home";

export function meta() {
  return [{ title: "Just 2 Guys — League history, live" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const env = getRequestEnv(context);
  return {
    ...(await getHomePage(env.DB, Number(env.ACTIVE_SEASON))),
    staleAfterSeconds: Number(env.STALE_AFTER_SECONDS),
  };
}

export function headers() {
  return {
    "Cache-Control":
      "public, max-age=30, s-maxage=30, stale-while-revalidate=120",
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const {
    active,
    featured,
    seasonCount,
    managerCount,
    latestWeek,
    latestMatchups,
    archive,
    leaders,
    lastCompleted,
    notablePerformances,
  } = loaderData;
  const year = featured?.season.year ?? Number(active?.season.year ?? 2026);
  return (
    <main>
      <section className="hero wrap">
        <PageHeader
          eyebrow="Since 2013 · Yahoo to Sleeper"
          title="Every season. Every score. All the receipts."
          description="The living almanac of one needlessly complicated fantasy football league."
          aside={active && <StatusPill status={active.season.status} />}
        />
        <div className="hero-stats" aria-label="League at a glance">
          <div>
            <strong>{seasonCount}</strong>
            <span>seasons tracked</span>
          </div>
          <div>
            <strong>{managerCount}</strong>
            <span>managers tracked</span>
          </div>
          <div>
            <strong>30 min</strong>
            <span>live sync target</span>
          </div>
        </div>
      </section>

      <section className="section wrap" aria-labelledby="scoreboard-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">On the board</p>
            <h2 id="scoreboard-heading">
              {year} · Week {latestWeek || "—"}
            </h2>
          </div>
          {latestWeek > 0 && (
            <nav className="week-links" aria-label="Current week navigation">
              {latestWeek > 1 && (
                <Link to={`/seasons/${year}/weeks/${latestWeek - 1}`}>
                  ← W{latestWeek - 1}
                </Link>
              )}
              <Link to={`/seasons/${year}/weeks/${latestWeek}`}>
                Full week →
              </Link>
            </nav>
          )}
        </div>
        <LiveScoreboard
          initialMatchups={latestMatchups}
          initialFreshness={loaderData.freshness}
          endpoint={`/api/seasons/${year}/weeks/${latestWeek}`}
          staleAfterSeconds={loaderData.staleAfterSeconds}
          poll={
            active?.season.status === "in_season" &&
            year === active.season.year &&
            latestWeek > 0
          }
        />
      </section>

      {(lastCompleted || notablePerformances.length > 0) && (
        <section className="section wrap home-notables">
          <div>
            <p className="eyebrow">Last word</p>
            <h2>{lastCompleted?.year} season</h2>
            <p>
              {lastCompleted?.champion_name
                ? `${lastCompleted.champion_name} won the title.`
                : "The latest completed season is archived."}
              {lastCompleted?.last_place_name
                ? ` ${lastCompleted.last_place_name} finished last.`
                : ""}
            </p>
            {lastCompleted && (
              <Link className="text-link" to={`/seasons/${lastCompleted.year}`}>
                Open season →
              </Link>
            )}
          </div>
          <div>
            <p className="eyebrow">Recent extremes</p>
            <h2>Notable performances</h2>
            <div className="award-grid compact">
              {notablePerformances.map(({ definition, entry }) => (
                <Link
                  to={entry.href ?? `/records/${definition.slug}`}
                  key={definition.slug}
                >
                  <span>{definition.name}</span>
                  <strong>{entry.label}</strong>
                  <small>{entry.valueLabel}</small>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section section-dark">
        <div className="wrap split-layout">
          <div>
            <div className="section-heading">
              <div>
                <p className="eyebrow">The table</p>
                <h2>{featured?.season.year ?? year} standings</h2>
              </div>
            </div>
            <StandingsTable
              rows={featured?.standings ?? []}
              year={featured?.season.year ?? year}
            />
          </div>
          <aside className="leader-panel">
            <p className="eyebrow">Career wins</p>
            <ol>
              {leaders.slice(0, 5).map((leader, index) => (
                <li key={leader.id}>
                  <span>{index + 1}</span>
                  <Link to={`/managers/${leader.slug}`}>{leader.name}</Link>
                  <strong>{leader.wins}</strong>
                </li>
              ))}
            </ol>
            <Link className="button button-light" to="/managers">
              All managers
            </Link>
          </aside>
        </div>
      </section>

      <section className="section wrap" aria-labelledby="archive-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The archive</p>
            <h2 id="archive-heading">Recent seasons</h2>
          </div>
          <Link className="text-link" to="/seasons">
            All seasons →
          </Link>
        </div>
        <div className="season-strip">
          {archive.map((season) => (
            <Link
              className="season-tile"
              to={`/seasons/${season.year}`}
              key={season.id}
            >
              <span>{season.year}</span>
              <strong>{season.name}</strong>
              <small>
                {season.champion_name
                  ? `Champion: ${season.champion_name}`
                  : season.status.replaceAll("_", " ")}
              </small>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
