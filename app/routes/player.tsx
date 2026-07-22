import { Link } from "react-router";

import { PageHeader } from "../components/page-header";
import { getRequestEnv } from "../lib/server";
import { getPlayerPage } from "../../server/domain/queries";
import type { Route } from "./+types/player";

export async function loader({ params, context }: Route.LoaderArgs) {
  const page = await getPlayerPage(getRequestEnv(context).DB, params.id);
  if (!page) throw new Response("Player not found", { status: 404 });
  return page;
}

export default function Player({ loaderData }: Route.ComponentProps) {
  const {
    player,
    starts,
    benchAppearances,
    starterPoints,
    best,
    worstStart,
    appearances,
    history,
    recordAppearances,
  } = loaderData;
  return (
    <main className="wrap page">
      <PageHeader
        eyebrow={`${player.position}${player.nfl_team ? ` · ${player.nfl_team}` : ""}`}
        title={player.name}
        description={`${starts} league starts · ${benchAppearances} bench appearances · ${starterPoints.toFixed(2)} starter points`}
        aside={
          player.image_url ? (
            <img
              className="player-portrait"
              src={player.image_url}
              alt=""
              width="104"
              height="104"
            />
          ) : undefined
        }
      />
      <section className="stat-band">
        <div>
          <span>Starts</span>
          <strong>{starts}</strong>
        </div>
        <div>
          <span>Bench</span>
          <strong>{benchAppearances}</strong>
        </div>
        <div>
          <span>Best</span>
          <strong>{best?.points.toFixed(2) ?? "—"}</strong>
        </div>
        <div>
          <span>Worst start</span>
          <strong>{worstStart?.points.toFixed(2) ?? "—"}</strong>
        </div>
      </section>
      <section className="section">
        <p className="eyebrow">Who started him</p>
        <h2>Manager & team history</h2>
        <div className="history-list">
          {history.map((entry) => (
            <Link
              to={`/managers/${entry.managerSlug}`}
              key={`${entry.year}:${entry.teamName}:${entry.managerSlug}`}
            >
              <strong>{entry.year}</strong>
              <span>
                {entry.teamName} · {entry.managerName}
              </span>
              <small>
                {entry.starts} starts · {entry.bench} bench ·{" "}
                {entry.points.toFixed(2)} pts
              </small>
            </Link>
          ))}
        </div>
      </section>
      {recordAppearances.length > 0 && (
        <section className="section">
          <p className="eyebrow">Record book</p>
          <h2>Leaderboard appearances</h2>
          <div className="award-grid">
            {recordAppearances.map(({ definition, entry }) => (
              <Link to={`/records/${definition.slug}`} key={definition.slug}>
                <span>#{entry.rank}</span>
                <strong>{definition.name}</strong>
                <small>
                  {entry.valueLabel} · {entry.detail}
                </small>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="section">
        <p className="eyebrow">Game log</p>
        <h2>Just 2 Guys appearances</h2>
        <div className="history-list">
          {appearances.slice(0, 100).map((entry, index) => (
            <Link
              to={`/matchups/${entry.matchup_id}`}
              key={`${entry.matchup_id}-${entry.manager_slug}-${index}`}
            >
              <strong>
                {entry.year} W{entry.week}
              </strong>
              <span>
                {entry.team_name} · {entry.manager_name}
              </span>
              <small>
                {entry.classification} · {entry.points.toFixed(2)}
              </small>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
