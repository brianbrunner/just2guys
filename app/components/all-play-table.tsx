import {
  SortableHeader,
  type SortColumns,
  useSortableRows,
} from "./sortable-table";

export interface AllPlayRow {
  rank: number;
  teamId: string;
  teamName: string;
  managerNames: string[];
  groupLabel: string | null;
  actualRank: number;
  actualWins: number;
  actualLosses: number;
  actualTies: number;
  allPlayWins: number;
  allPlayLosses: number;
  allPlayTies: number;
  allPlayPercentage: number;
  expectedWins: number;
  luckDelta: number;
  pointsFor: number;
  rankDelta: number;
}

type SortKey =
  | "rank"
  | "team"
  | "actual"
  | "allPlay"
  | "percentage"
  | "expectedWins"
  | "luck"
  | "points";

const columns: SortColumns<AllPlayRow, SortKey> = {
  rank: {
    compare: (left, right) => left.rank - right.rank,
    initialDirection: "ascending",
  },
  team: {
    compare: (left, right) => left.teamName.localeCompare(right.teamName),
    initialDirection: "ascending",
  },
  actual: {
    compare: (left, right) =>
      left.actualWins +
      left.actualTies * 0.5 -
      (right.actualWins + right.actualTies * 0.5),
    initialDirection: "descending",
  },
  allPlay: {
    compare: (left, right) =>
      left.allPlayWins +
      left.allPlayTies * 0.5 -
      (right.allPlayWins + right.allPlayTies * 0.5),
    initialDirection: "descending",
  },
  percentage: {
    compare: (left, right) => left.allPlayPercentage - right.allPlayPercentage,
    initialDirection: "descending",
  },
  expectedWins: {
    compare: (left, right) => left.expectedWins - right.expectedWins,
    initialDirection: "descending",
  },
  luck: {
    compare: (left, right) => left.luckDelta - right.luckDelta,
    initialDirection: "descending",
  },
  points: {
    compare: (left, right) => left.pointsFor - right.pointsFor,
    initialDirection: "descending",
  },
};

function record(wins: number, losses: number, ties: number) {
  return `${wins}–${losses}${ties ? `–${ties}` : ""}`;
}

export function AllPlayTable({ rows }: { rows: AllPlayRow[] }) {
  const { sortedRows, sort, requestSort } = useSortableRows<
    AllPlayRow,
    SortKey
  >(rows, columns, { key: "rank", direction: "ascending" });
  return (
    <div className="table-scroll">
      <table className="all-play-table">
        <thead>
          <tr>
            <SortableHeader
              column="rank"
              label="#"
              sort={sort}
              onSort={requestSort}
            />
            <SortableHeader
              column="team"
              label="Team"
              sort={sort}
              onSort={requestSort}
              align="left"
            />
            <SortableHeader
              column="actual"
              label="Actual"
              sort={sort}
              onSort={requestSort}
            />
            <SortableHeader
              column="allPlay"
              label="All-play"
              sort={sort}
              onSort={requestSort}
            />
            <SortableHeader
              column="percentage"
              label="All-play %"
              sort={sort}
              onSort={requestSort}
            />
            <SortableHeader
              column="expectedWins"
              label="xW"
              sort={sort}
              onSort={requestSort}
            />
            <SortableHeader
              column="luck"
              label="Luck"
              sort={sort}
              onSort={requestSort}
            />
            <SortableHeader
              column="points"
              label="PF"
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
                {row.teamName}
                <small>
                  {row.managerNames.join(" & ")}
                  {row.groupLabel ? ` · ${row.groupLabel}` : ""}
                </small>
              </th>
              <td>
                {record(row.actualWins, row.actualLosses, row.actualTies)}
                <small>#{row.actualRank}</small>
              </td>
              <td>
                {record(row.allPlayWins, row.allPlayLosses, row.allPlayTies)}
              </td>
              <td>{(row.allPlayPercentage * 100).toFixed(1)}%</td>
              <td>{row.expectedWins.toFixed(2)}</td>
              <td
                className={
                  row.luckDelta > 0
                    ? "number-positive"
                    : row.luckDelta < 0
                      ? "number-negative"
                      : undefined
                }
              >
                {row.luckDelta > 0 ? "+" : ""}
                {row.luckDelta.toFixed(2)}
              </td>
              <td>{row.pointsFor.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
