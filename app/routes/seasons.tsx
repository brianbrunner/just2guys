import { Link } from "react-router";

import { PageHeader } from "../components/page-header";
import { StatusPill } from "../components/status-pill";
import { getRequestEnv } from "../lib/server";
import { getSeasonArchive } from "../../server/domain/queries";
import type { Route } from "./+types/seasons";

export async function loader({ context }: Route.LoaderArgs) {
  return getSeasonArchive(getRequestEnv(context).DB);
}

export default function Seasons({ loaderData }: Route.ComponentProps) {
  return (
    <main className="wrap page">
      <PageHeader eyebrow="2013 to now" title="Season archive" />
      <div className="archive-grid">
        {loaderData.map((season) => (
          <article className="archive-card" key={season.id}>
            <div>
              <span className="archive-year">{season.year}</span>
              <StatusPill status={season.status} />
            </div>
            <h2>
              <Link to={`/seasons/${season.year}`}>{season.name}</Link>
            </h2>
            <p>
              {season.team_count} teams ·{" "}
              {season.structure === "grouped"
                ? "Multi-league format"
                : "Single league"}
            </p>
            <dl>
              <div>
                <dt>Champion</dt>
                <dd>{season.champion_name ?? "Pending review"}</dd>
              </div>
              <div>
                <dt>Last place</dt>
                <dd>{season.last_place_name ?? "Pending review"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </main>
  );
}
