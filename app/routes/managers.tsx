import { Link } from "react-router";

import { PageHeader } from "../components/page-header";
import { getRequestEnv } from "../lib/server";
import { getManagersPage } from "../../server/domain/queries";
import type { Route } from "./+types/managers";

export async function loader({ context }: Route.LoaderArgs) {
  return getManagersPage(getRequestEnv(context).DB);
}

export default function Managers({ loaderData }: Route.ComponentProps) {
  return (
    <main className="wrap page">
      <PageHeader
        eyebrow="Career ledger"
        title="Managers"
        description="Ranked by Elo across reviewed canonical games. Provider identities are combined only after explicit owner review."
      />
      <div className="table-scroll">
        <table className="manager-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Manager</th>
              <th>Seasons</th>
              <th>Record</th>
              <th>Win%</th>
              <th>Elo</th>
              <th>Points</th>
              <th>Titles</th>
              <th>Lasts</th>
            </tr>
          </thead>
          <tbody>
            {loaderData.map((manager, index) => (
              <tr key={manager.id}>
                <td>{index + 1}</td>
                <th>
                  <Link to={`/managers/${manager.slug}`}>{manager.name}</Link>
                </th>
                <td>
                  {manager.seasons}
                  {manager.reviewSeasons.length > 0 && (
                    <small>+{manager.reviewSeasons.length} under review</small>
                  )}
                </td>
                <td>
                  {manager.wins}–{manager.losses}
                  {manager.ties ? `–${manager.ties}` : ""}
                </td>
                <td>{(manager.winPercentage * 100).toFixed(1)}%</td>
                <td>
                  <strong>{Math.round(manager.elo)}</strong>
                </td>
                <td>{manager.points.toFixed(2)}</td>
                <td>{manager.championships}</td>
                <td>{manager.lastPlaces}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
