import { Link } from "react-router";

import { PageHeader } from "../components/page-header";
import { StatusPill } from "../components/status-pill";
import { getRequestEnv } from "../lib/server";
import { getMatchupPage } from "../../server/domain/queries";
import type { Route } from "./+types/matchup";

export async function loader({ params, context }: Route.LoaderArgs) {
  const page = await getMatchupPage(getRequestEnv(context).DB, params.id);
  if (!page) throw new Response("Matchup not found", { status: 404 });
  return page;
}

export default function Matchup({ loaderData }: Route.ComponentProps) {
  const { matchup, sides } = loaderData;
  return (
    <main className="wrap page">
      <PageHeader
        eyebrow={`${matchup.season_name} · Week ${matchup.week} · ${matchup.placement_label ?? matchup.phase}`}
        title={sides.map((side) => side.team_name).join(" vs ")}
        aside={<StatusPill status={matchup.status} />}
      />
      {matchup.corrected === 1 && (
        <aside className="review-banner">
          <strong>Reviewed correction applied.</strong> The source and reason
          are recorded in the season ledger.
        </aside>
      )}
      {matchup.placement_label?.startsWith("Ultimate") && (
        <aside className="review-banner">
          <strong>Reviewed cross-conference matchup.</strong> These two source
          scores were combined according to the league&apos;s approved
          historical format.
        </aside>
      )}
      <section className="matchup-score">
        <span>{sides[0]?.team_name}</span>
        <strong>{sides[0]?.points.toFixed(2) ?? "—"}</strong>
        <em>vs</em>
        <strong>{sides[1]?.points.toFixed(2) ?? "—"}</strong>
        <span>{sides[1]?.team_name ?? "Bye"}</span>
      </section>
      <section className="lineup-grid">
        {sides.map((side) => (
          <article className="lineup" key={side.id}>
            <header>
              <div>
                <p className="eyebrow">{side.outcome}</p>
                <h2>{side.team_name}</h2>
                <p>
                  {side.managers.map((manager, index) => (
                    <span key={manager.slug}>
                      {index ? " & " : ""}
                      <Link to={`/managers/${manager.slug}`}>
                        {manager.preferred_name}
                      </Link>
                    </span>
                  ))}
                </p>
              </div>
              <div className="lineup-total">
                <strong>{side.points.toFixed(2)}</strong>
                {side.projected_points !== null && (
                  <small>{side.projected_points.toFixed(2)} projected</small>
                )}
              </div>
            </header>
            {(["starter", "bench", "ir"] as const).map((classification) => {
              const entries = side.lineup.filter(
                (entry) => entry.classification === classification,
              );
              if (!entries.length) return null;
              return (
                <div className="lineup-group" key={classification}>
                  <h3>{classification}</h3>
                  {entries.map((entry) => (
                    <Link
                      className="player-row"
                      to={`/players/${entry.player_id}`}
                      key={entry.id}
                    >
                      <span className="slot-label">{entry.slot}</span>
                      <span>
                        <strong>{entry.player_name}</strong>
                        <small>
                          {entry.position}
                          {entry.nfl_team ? ` · ${entry.nfl_team}` : ""}
                        </small>
                      </span>
                      <span className="lineup-points">
                        <b>{entry.points.toFixed(2)}</b>
                        {entry.projected_points !== null && (
                          <small>
                            {entry.projected_points.toFixed(2)} proj
                          </small>
                        )}
                      </span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </article>
        ))}
      </section>
      <p className="back-link">
        <Link to={`/seasons/${matchup.year}/weeks/${matchup.week}`}>
          ← Back to week {matchup.week}
        </Link>
      </p>
    </main>
  );
}
