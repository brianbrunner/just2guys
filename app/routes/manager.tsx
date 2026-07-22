import { Link } from "react-router";

import { EloChart } from "../components/elo-chart";
import { PageHeader } from "../components/page-header";
import { getRequestEnv } from "../lib/server";
import { getManagerPage } from "../../server/domain/queries";
import type { Route } from "./+types/manager";

export async function loader({ params, context }: Route.LoaderArgs) {
  const page = await getManagerPage(getRequestEnv(context).DB, params.slug);
  if (!page) throw new Response("Manager not found", { status: 404 });
  return page;
}

export default function Manager({ loaderData }: Route.ComponentProps) {
  const {
    manager,
    teams,
    rivals,
    favoritePlayers,
    aliases,
    knownAliases,
    playoffAppearances,
    bestFinish,
    bestRegularSeason,
    closestRival,
    nemesis,
    notableRecords,
    elo,
  } = loaderData;
  return (
    <main className="wrap page">
      <PageHeader
        eyebrow={`${manager.recordedSeasons} season${manager.recordedSeasons === 1 ? "" : "s"} recorded${manager.reviewSeasons.length ? ` · ${manager.reviewSeasons.length} under review` : " · career profile"}`}
        title={manager.name}
        description={`${manager.wins}–${manager.losses}${manager.ties ? `–${manager.ties}` : ""} · ${(manager.winPercentage * 100).toFixed(1)}% · ${manager.championships} championship${manager.championships === 1 ? "" : "s"}${aliases.length ? ` · ${aliases.map((alias) => `${alias.provider}: ${alias.display_name}`).join(" · ")}` : ""}${knownAliases.length ? ` · known as ${knownAliases.join(", ")}` : ""}`}
      />
      {manager.reviewSeasons.length > 0 && (
        <aside className="review-banner">
          <strong>Some history is under data review.</strong> Teams from{" "}
          {manager.reviewSeasons.join(", ")} are shown below but excluded from
          the official career totals and records above.
        </aside>
      )}
      <section className="stat-band">
        <div>
          <span>Elo rating</span>
          <strong>{Math.round(elo.current)}</strong>
        </div>
        <div>
          <span>Playoff berths</span>
          <strong>{playoffAppearances}</strong>
        </div>
        <div>
          <span>Points</span>
          <strong>{manager.points.toFixed(1)}</strong>
        </div>
        <div>
          <span>Titles</span>
          <strong>{manager.championships}</strong>
        </div>
        <div>
          <span>Lasts</span>
          <strong>{manager.lastPlaces}</strong>
        </div>
      </section>
      {elo.history.length > 0 && (
        <section className="elo-section" aria-labelledby="elo-heading">
          <div className="elo-heading">
            <div>
              <p className="eyebrow">Power rating</p>
              <h2 id="elo-heading">How good is {manager.name}?</h2>
            </div>
            <dl className="elo-summary">
              <div>
                <dt>League rank</dt>
                <dd>#{manager.eloRank}</dd>
              </div>
              <div>
                <dt>Peak</dt>
                <dd>{Math.round(elo.peak)}</dd>
              </div>
              <div>
                <dt>Low</dt>
                <dd>{Math.round(elo.low)}</dd>
              </div>
            </dl>
          </div>
          <EloChart
            managerName={manager.name}
            managerSlug={manager.slug}
            points={elo.history}
          />
          <p className="elo-method">
            Elo 1500 baseline · K-factor 20 · no margin-of-victory bonus ·
            reviewed final games only · noncompetitive placement games excluded
          </p>
        </section>
      )}
      <section className="profile-highlights" aria-label="Career highlights">
        <article>
          <span>Best finish</span>
          <strong>
            {bestFinish
              ? `#${bestFinish.finalPlace} · ${bestFinish.year}`
              : "Not recorded"}
          </strong>
          <small>{bestFinish?.name}</small>
        </article>
        <article>
          <span>Best regular season</span>
          <strong>
            {bestRegularSeason
              ? `${bestRegularSeason.wins} wins · ${bestRegularSeason.team.year}`
              : "Not recorded"}
          </strong>
          <small>{bestRegularSeason?.team.name}</small>
        </article>
        <article>
          <span>Closest rival</span>
          {closestRival ? (
            <Link
              to={`/rivalries/${manager.slug}/${closestRival.manager.slug}`}
            >
              <strong>{closestRival.manager.name}</strong>
              <small>
                {closestRival.wins}–{closestRival.losses}
                {closestRival.ties ? `–${closestRival.ties}` : ""}
              </small>
            </Link>
          ) : (
            <strong>Not enough games</strong>
          )}
        </article>
        <article>
          <span>Nemesis</span>
          {nemesis ? (
            <Link to={`/rivalries/${manager.slug}/${nemesis.manager.slug}`}>
              <strong>{nemesis.manager.name}</strong>
              <small>{nemesis.losses} losses</small>
            </Link>
          ) : (
            <strong>Not enough games</strong>
          )}
        </article>
      </section>
      <div className="split-layout section">
        <section>
          <p className="eyebrow">Year by year</p>
          <h2>Team history</h2>
          <div className="history-list">
            {teams.map((team) => (
              <Link to={`/seasons/${team.year}`} key={team.id}>
                <strong>{team.year}</strong>
                <span>{team.name}</span>
                <small>
                  {team.underReview
                    ? "Under review"
                    : team.finalPlace
                      ? `Finished #${team.finalPlace}`
                      : ""}
                </small>
              </Link>
            ))}
          </div>
        </section>
        <aside>
          <p className="eyebrow">Head to head</p>
          <h2>Frequent rivals</h2>
          <div className="rival-list">
            {rivals.slice(0, 8).map((rival) => (
              <Link
                to={`/rivalries/${manager.slug}/${rival.manager.slug}`}
                key={rival.manager.id}
              >
                <span>{rival.manager.name}</span>
                <strong>
                  {rival.wins}–{rival.losses}
                  {rival.ties ? `–${rival.ties}` : ""}
                </strong>
              </Link>
            ))}
          </div>
        </aside>
      </div>
      <section className="section">
        <p className="eyebrow">Commitment issues</p>
        <h2>Favorite starters</h2>
        <div className="player-chips">
          {favoritePlayers.map((player) => (
            <Link to={`/players/${player.id}`} key={player.id}>
              <strong>{player.name}</strong>
              <span>{player.starts} starts</span>
            </Link>
          ))}
        </div>
      </section>
      {notableRecords.length > 0 && (
        <section className="section">
          <p className="eyebrow">In the books</p>
          <h2>Notable records</h2>
          <div className="award-grid">
            {notableRecords.slice(0, 8).map(({ definition, entry }) => (
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
    </main>
  );
}
