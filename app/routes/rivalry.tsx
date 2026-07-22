import { Link } from "react-router";

import { PageHeader } from "../components/page-header";
import { Scoreboard } from "../components/scoreboard";
import { getRequestEnv } from "../lib/server";
import { getRivalryPage } from "../../server/domain/queries";
import type { Route } from "./+types/rivalry";

export async function loader({ params, context }: Route.LoaderArgs) {
  const page = await getRivalryPage(
    getRequestEnv(context).DB,
    params.managerA,
    params.managerB,
  );
  if (!page) throw new Response("Rivalry not found", { status: 404 });
  return page;
}

export default function Rivalry({ loaderData }: Route.ComponentProps) {
  const rivalry = loaderData;
  const recordSuffix = rivalry.ties ? `–${rivalry.ties}` : "";
  const description =
    rivalry.wins === rivalry.losses
      ? `Series tied ${rivalry.wins}–${rivalry.losses}${recordSuffix}`
      : rivalry.wins > rivalry.losses
        ? `${rivalry.managerA.name} leads ${rivalry.wins}–${rivalry.losses}${recordSuffix} (${(rivalry.winPercentage * 100).toFixed(1)}%)`
        : `${rivalry.managerB.name} leads ${rivalry.losses}–${rivalry.wins}${recordSuffix} (${((1 - rivalry.winPercentage) * 100).toFixed(1)}%)`;
  return (
    <main className="wrap page">
      <PageHeader
        eyebrow={`${rivalry.totalGames} meetings · ${rivalry.postseasonMeetings} postseason`}
        title={`${rivalry.managerA.name} vs ${rivalry.managerB.name}`}
        description={description}
      />
      <section className="stat-band">
        <div>
          <span>{rivalry.managerA.name} points</span>
          <strong>{rivalry.pointsFor.toFixed(1)}</strong>
        </div>
        <div>
          <span>{rivalry.managerB.name} points</span>
          <strong>{rivalry.pointsAgainst.toFixed(1)}</strong>
        </div>
        <div>
          <span>Current streak</span>
          <strong>
            {rivalry.streak.games
              ? `${rivalry.streak.owner} ${rivalry.streak.games}`
              : "None"}
          </strong>
        </div>
        <div>
          <span>Postseason</span>
          <strong>{rivalry.postseasonMeetings}</strong>
        </div>
      </section>
      <section className="profile-highlights" aria-label="Rivalry extremes">
        <article>
          <span>Closest {rivalry.managerA.name} win</span>
          {rivalry.smallestVictory ? (
            <Link to={`/matchups/${rivalry.smallestVictory.matchupId}`}>
              <strong>{rivalry.smallestVictory.margin.toFixed(2)} pts</strong>
            </Link>
          ) : (
            <strong>—</strong>
          )}
        </article>
        <article>
          <span>Largest {rivalry.managerA.name} win</span>
          {rivalry.largestVictory ? (
            <Link to={`/matchups/${rivalry.largestVictory.matchupId}`}>
              <strong>{rivalry.largestVictory.margin.toFixed(2)} pts</strong>
            </Link>
          ) : (
            <strong>—</strong>
          )}
        </article>
        <article>
          <span>Closest defeat</span>
          {rivalry.smallestDefeat ? (
            <Link to={`/matchups/${rivalry.smallestDefeat.matchupId}`}>
              <strong>{rivalry.smallestDefeat.margin.toFixed(2)} pts</strong>
            </Link>
          ) : (
            <strong>—</strong>
          )}
        </article>
        <article>
          <span>Largest defeat</span>
          {rivalry.largestDefeat ? (
            <Link to={`/matchups/${rivalry.largestDefeat.matchupId}`}>
              <strong>{rivalry.largestDefeat.margin.toFixed(2)} pts</strong>
            </Link>
          ) : (
            <strong>—</strong>
          )}
        </article>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The tape</p>
            <h2>Every meeting</h2>
          </div>
        </div>
        <Scoreboard matchups={rivalry.games} />
      </section>
      <p className="back-link">
        <Link to={`/managers/${rivalry.managerA.slug}`}>
          ← {rivalry.managerA.name}
        </Link>
      </p>
    </main>
  );
}
