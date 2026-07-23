import { Link } from "react-router";

import { HistoryNav } from "../components/history-nav";
import { PageHeader } from "../components/page-header";
import { getRequestEnv } from "../lib/server";
import { getTeamNameMuseum } from "../../server/domain/history";
import type { Route } from "./+types/team-names";

export function meta() {
  return [{ title: "Team-Name Museum — Just 2 Guys" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  return getTeamNameMuseum(getRequestEnv(context).DB);
}

export default function TeamNames({ loaderData }: Route.ComponentProps) {
  return (
    <main className="wrap page">
      <PageHeader eyebrow="The full collection" title="Team-name museum" />
      <HistoryNav />
      <div className="museum-grid">
        {loaderData.map((person) => {
          const names = new Map<
            string,
            {
              name: string;
              years: number[];
              logoUrl: string | null;
              groupLabels: string[];
            }
          >();
          for (const team of person.teams) {
            const key = team.name.toLocaleLowerCase();
            const exhibit = names.get(key) ?? {
              name: team.name,
              years: [],
              logoUrl: team.logoUrl,
              groupLabels: [],
            };
            exhibit.years.push(team.year);
            if (team.groupLabel) exhibit.groupLabels.push(team.groupLabel);
            if (!exhibit.logoUrl && team.logoUrl)
              exhibit.logoUrl = team.logoUrl;
            names.set(key, exhibit);
          }
          return (
            <article key={person.id}>
              <header>
                <h2>
                  <Link to={`/managers/${person.slug}`}>{person.name}</Link>
                </h2>
                <span>{person.uniqueNames} names</span>
              </header>
              <ol>
                {[...names.values()]
                  .sort(
                    (left, right) =>
                      Math.max(...right.years) - Math.max(...left.years),
                  )
                  .map((exhibit) => (
                    <li key={exhibit.name.toLocaleLowerCase()}>
                      {exhibit.logoUrl ? (
                        <img src={exhibit.logoUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="museum-monogram" aria-hidden="true">
                          {exhibit.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <div>
                        <strong>{exhibit.name}</strong>
                        <small>
                          {[...new Set(exhibit.years)]
                            .sort((left, right) => left - right)
                            .join(", ")}
                        </small>
                      </div>
                    </li>
                  ))}
              </ol>
            </article>
          );
        })}
      </div>
    </main>
  );
}
