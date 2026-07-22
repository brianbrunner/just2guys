import { data, Link } from "react-router";

import { PageHeader } from "../components/page-header";
import { Scoreboard } from "../components/scoreboard";
import { StandingsTable } from "../components/standings-table";
import { StatusPill } from "../components/status-pill";
import { getRequestEnv } from "../lib/server";
import { getSeasonPage } from "../../server/domain/queries";
import type { Route } from "./+types/season";

export async function loader({ params, context }: Route.LoaderArgs) {
  const year = Number(params.year);
  if (!Number.isInteger(year))
    throw new Response("Season not found", { status: 404 });
  const page = await getSeasonPage(getRequestEnv(context).DB, year);
  if (!page) throw new Response("Season not found", { status: 404 });
  return data(page, {
    headers: {
      "Cache-Control":
        page.season.status === "complete"
          ? "public, max-age=300, s-maxage=86400"
          : "public, max-age=30, s-maxage=30",
    },
  });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function Season({ loaderData }: Route.ComponentProps) {
  const {
    season,
    standings,
    matchups,
    champion,
    lastPlace,
    sources,
    corrections,
    standingsSource,
    standingsTiebreakers,
    awards,
  } = loaderData;
  const weeks = [...new Set(matchups.map((matchup) => matchup.week))].sort(
    (left, right) => right - left,
  );
  const selectedWeek = weeks[0] ?? season.regular_season_start_week;
  const postseasonWeeks = weeks
    .map((week) => ({
      week,
      games: matchups.filter(
        (matchup) => matchup.week === week && matchup.phase !== "regular",
      ),
    }))
    .filter((round) => round.games.length > 0)
    .reverse();
  return (
    <main className="wrap page">
      <PageHeader
        eyebrow={`${season.structure === "grouped" ? "Multi-league" : "Single league"} · ${season.team_count} teams`}
        title={`${season.year} · ${season.name}`}
        aside={<StatusPill status={season.status} />}
      />
      {season.status === "needs_review" && (
        <aside className="review-banner">
          <strong>Under data review.</strong> This season is visible for
          reconciliation but excluded from career totals and records.
        </aside>
      )}
      <section className="result-banner">
        <div>
          <span>Champion</span>
          <strong>{champion?.name ?? "Not finalized"}</strong>
          <small>
            {champion?.managers.map((manager) => manager.name).join(" & ")}
          </small>
        </div>
        <div>
          <span>Last place</span>
          <strong>{lastPlace?.name ?? "Not finalized"}</strong>
          <small>
            {lastPlace?.managers.map((manager) => manager.name).join(" & ")}
          </small>
        </div>
      </section>
      <section className="section" aria-labelledby="season-standings">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Regular season</p>
            <h2 id="season-standings">Final table</h2>
            <p className="section-note">
              {standingsSource === "official"
                ? "Official platform order"
                : `Reconstructed: ${standingsTiebreakers
                    .map((rule) => rule.replaceAll("_", " "))
                    .join(" → ")}`}
            </p>
          </div>
        </div>
        <StandingsTable rows={standings} year={season.year} />
      </section>
      <section className="section" aria-labelledby="season-games">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Scoreboards</p>
            <h2 id="season-games">Week {selectedWeek}</h2>
          </div>
          <div className="week-links">
            {weeks.map((week) => (
              <Link key={week} to={`/seasons/${season.year}/weeks/${week}`}>
                W{week}
              </Link>
            ))}
          </div>
        </div>
        <Scoreboard
          matchups={matchups.filter((matchup) => matchup.week === selectedWeek)}
        />
      </section>
      {postseasonWeeks.length > 0 && (
        <section className="section" aria-labelledby="season-bracket">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Postseason path</p>
              <h2 id="season-bracket">Bracket rounds</h2>
            </div>
          </div>
          <div className="bracket-grid">
            {postseasonWeeks.map((round) => (
              <div className="bracket-round" key={round.week}>
                <h3>Week {round.week}</h3>
                {round.games.map((game) => (
                  <Link to={`/matchups/${game.id}`} key={game.id}>
                    <small>{game.placementLabel ?? game.phase}</small>
                    {game.sides.map((side) => (
                      <span key={side.id}>
                        <b>{side.teamName}</b>
                        <em>{side.points.toFixed(2)}</em>
                      </span>
                    ))}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
      {awards.length > 0 && (
        <section className="section" aria-labelledby="season-awards">
          <p className="eyebrow">Season superlatives</p>
          <h2 id="season-awards">In the record book</h2>
          <div className="award-grid">
            {awards.map(({ definition, entry }) => (
              <Link
                to={entry.href ?? `/records/${definition.slug}`}
                key={definition.slug}
              >
                <span>{definition.name}</span>
                <strong>{entry.label}</strong>
                <small>
                  {entry.valueLabel} · {entry.detail}
                </small>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="section provenance">
        <div>
          <p className="eyebrow">Data provenance</p>
          <h2>Source ledger</h2>
        </div>
        <ul>
          {sources.map((source) => (
            <li key={`${source.provider}:${source.external_id}`}>
              <strong>{source.provider}</strong> · {source.external_id} ·{" "}
              {source.role}
              {source.group_label ? ` · ${source.group_label}` : ""}
              {!source.enabled ? ` — ignored: ${source.ignored_reason}` : ""}
            </li>
          ))}
        </ul>
        {corrections.length > 0 && (
          <p>
            {corrections.length} reviewed correction
            {corrections.length === 1 ? "" : "s"} applied.
          </p>
        )}
      </section>
    </main>
  );
}
