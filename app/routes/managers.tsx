import { Link } from "react-router";

import { PageHeader } from "../components/page-header";
import {
  SortableHeader,
  type SortColumns,
  useSortableRows,
} from "../components/sortable-table";
import { getRequestEnv } from "../lib/server";
import { getManagersPage } from "../../server/domain/queries";
import type { Route } from "./+types/managers";

type Manager = Awaited<ReturnType<typeof getManagersPage>>[number];
type ManagerRow = Manager & { rank: number };
type ManagerSortKey =
  | "rank"
  | "manager"
  | "seasons"
  | "record"
  | "winPercentage"
  | "elo"
  | "points"
  | "championships"
  | "lastPlaces";

const managerSortColumns: SortColumns<ManagerRow, ManagerSortKey> = {
  rank: {
    compare: (left, right) => left.rank - right.rank,
    initialDirection: "ascending",
  },
  manager: {
    compare: (left, right) => left.name.localeCompare(right.name),
    initialDirection: "ascending",
  },
  seasons: {
    compare: (left, right) => left.seasons - right.seasons,
    initialDirection: "descending",
  },
  record: {
    compare: (left, right) =>
      left.wins - right.wins ||
      right.losses - left.losses ||
      left.ties - right.ties,
    initialDirection: "descending",
  },
  winPercentage: {
    compare: (left, right) => left.winPercentage - right.winPercentage,
    initialDirection: "descending",
  },
  elo: {
    compare: (left, right) => left.elo - right.elo,
    initialDirection: "descending",
  },
  points: {
    compare: (left, right) => left.points - right.points,
    initialDirection: "descending",
  },
  championships: {
    compare: (left, right) => left.championships - right.championships,
    initialDirection: "descending",
  },
  lastPlaces: {
    compare: (left, right) => left.lastPlaces - right.lastPlaces,
    initialDirection: "descending",
  },
};

export async function loader({ context }: Route.LoaderArgs) {
  return getManagersPage(getRequestEnv(context).DB);
}

export default function Managers({ loaderData }: Route.ComponentProps) {
  const rankedManagers = loaderData.map((manager, index) => ({
    ...manager,
    rank: index + 1,
  }));
  const { sortedRows, sort, requestSort } = useSortableRows<
    ManagerRow,
    ManagerSortKey
  >(rankedManagers, managerSortColumns, {
    key: "elo",
    direction: "descending",
  });
  return (
    <main className="wrap page">
      <PageHeader eyebrow="Career ledger" title="Managers" />
      <div className="table-scroll">
        <table className="manager-table">
          <thead>
            <tr>
              <SortableHeader
                column="rank"
                label="#"
                sort={sort}
                onSort={requestSort}
              />
              <SortableHeader
                column="manager"
                label="Manager"
                sort={sort}
                onSort={requestSort}
                align="left"
              />
              <SortableHeader
                column="seasons"
                label="Seasons"
                sort={sort}
                onSort={requestSort}
              />
              <SortableHeader
                column="record"
                label="Record"
                sort={sort}
                onSort={requestSort}
              />
              <SortableHeader
                column="winPercentage"
                label="Win%"
                sort={sort}
                onSort={requestSort}
              />
              <SortableHeader
                column="elo"
                label="Elo"
                sort={sort}
                onSort={requestSort}
              />
              <SortableHeader
                column="points"
                label="Points"
                sort={sort}
                onSort={requestSort}
              />
              <SortableHeader
                column="championships"
                label="Titles"
                sort={sort}
                onSort={requestSort}
              />
              <SortableHeader
                column="lastPlaces"
                label="Lasts"
                sort={sort}
                onSort={requestSort}
              />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((manager) => (
              <tr key={manager.id}>
                <td>{manager.rank}</td>
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
