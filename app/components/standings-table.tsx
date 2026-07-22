import { Link } from "react-router";

import {
  SortableHeader,
  type SortColumns,
  useSortableRows,
} from "./sortable-table";

export interface StandingRow {
  rank: number;
  teamId: string;
  teamName: string;
  managerNames: string[];
  groupLabel: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

type StandingSortKey =
  "rank" | "club" | "wins" | "losses" | "ties" | "pointsFor" | "pointsAgainst";

const standingSortColumns: SortColumns<StandingRow, StandingSortKey> = {
  rank: {
    compare: (left, right) => left.rank - right.rank,
    initialDirection: "ascending",
  },
  club: {
    compare: (left, right) => left.teamName.localeCompare(right.teamName),
    initialDirection: "ascending",
  },
  wins: {
    compare: (left, right) => left.wins - right.wins,
    initialDirection: "descending",
  },
  losses: {
    compare: (left, right) => left.losses - right.losses,
    initialDirection: "descending",
  },
  ties: {
    compare: (left, right) => left.ties - right.ties,
    initialDirection: "descending",
  },
  pointsFor: {
    compare: (left, right) => left.pointsFor - right.pointsFor,
    initialDirection: "descending",
  },
  pointsAgainst: {
    compare: (left, right) => left.pointsAgainst - right.pointsAgainst,
    initialDirection: "descending",
  },
};

export function StandingsTable({
  rows,
  year,
}: {
  rows: StandingRow[];
  year: number;
}) {
  const { sortedRows, sort, requestSort } = useSortableRows<
    StandingRow,
    StandingSortKey
  >(rows, standingSortColumns, { key: "rank", direction: "ascending" });
  if (!rows.length)
    return (
      <div className="empty-state">
        Standings arrive after the first final matchup.
      </div>
    );
  return (
    <div className="table-scroll">
      <table className="standings-table">
        <thead>
          <tr>
            <SortableHeader
              column="rank"
              label="#"
              sort={sort}
              onSort={requestSort}
            />
            <SortableHeader
              column="club"
              label="Club"
              sort={sort}
              onSort={requestSort}
              align="left"
            />
            <SortableHeader
              column="wins"
              label="W"
              sort={sort}
              onSort={requestSort}
            />
            <SortableHeader
              column="losses"
              label="L"
              sort={sort}
              onSort={requestSort}
            />
            <SortableHeader
              column="ties"
              label="T"
              sort={sort}
              onSort={requestSort}
            />
            <SortableHeader
              column="pointsFor"
              label="PF"
              sort={sort}
              onSort={requestSort}
            />
            <SortableHeader
              column="pointsAgainst"
              label="PA"
              sort={sort}
              onSort={requestSort}
            />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.teamId}>
              <td className="rank-cell">{row.rank}</td>
              <th scope="row">
                <Link to={`/seasons/${year}`}>{row.teamName}</Link>
                <small>
                  {row.managerNames.join(" & ")}
                  {row.groupLabel ? ` · ${row.groupLabel}` : ""}
                </small>
              </th>
              <td>{row.wins}</td>
              <td>{row.losses}</td>
              <td>{row.ties}</td>
              <td>{row.pointsFor.toFixed(2)}</td>
              <td>{row.pointsAgainst.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
