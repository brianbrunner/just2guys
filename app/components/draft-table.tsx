import { Link } from "react-router";

import {
  SortableHeader,
  type SortColumns,
  useSortableRows,
} from "./sortable-table";

export interface DraftPickRow {
  id: string;
  pick_number: number;
  round: number;
  draft_slot: number;
  keeper: number;
  player_id: string;
  player_name: string;
  position: string;
  nfl_team: string | null;
  team_id: string | null;
  team_name: string | null;
  managerNames: string[];
}

type SortKey = "pick" | "player" | "position" | "team";

const columns: SortColumns<DraftPickRow, SortKey> = {
  pick: {
    compare: (left, right) => left.pick_number - right.pick_number,
    initialDirection: "ascending",
  },
  player: {
    compare: (left, right) => left.player_name.localeCompare(right.player_name),
    initialDirection: "ascending",
  },
  position: {
    compare: (left, right) => left.position.localeCompare(right.position),
    initialDirection: "ascending",
  },
  team: {
    compare: (left, right) =>
      (left.team_name ?? "").localeCompare(right.team_name ?? ""),
    initialDirection: "ascending",
  },
};

export function DraftTable({ picks }: { picks: DraftPickRow[] }) {
  const { sortedRows, sort, requestSort } = useSortableRows<
    DraftPickRow,
    SortKey
  >(picks, columns, { key: "pick", direction: "ascending" });
  return (
    <div className="table-scroll">
      <table className="draft-table">
        <thead>
          <tr>
            <SortableHeader
              column="pick"
              label="Pick"
              sort={sort}
              onSort={requestSort}
            />
            <SortableHeader
              column="player"
              label="Player"
              sort={sort}
              onSort={requestSort}
              align="left"
            />
            <SortableHeader
              column="position"
              label="Pos"
              sort={sort}
              onSort={requestSort}
            />
            <SortableHeader
              column="team"
              label="Drafted by"
              sort={sort}
              onSort={requestSort}
              align="left"
            />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((pick) => (
            <tr key={pick.id}>
              <td className="rank-cell">
                {pick.pick_number}
                <small>
                  {pick.round}.{pick.draft_slot}
                </small>
              </td>
              <th scope="row">
                <Link to={`/players/${pick.player_id}`}>
                  {pick.player_name}
                </Link>
                {pick.keeper ? <small>Keeper</small> : null}
              </th>
              <td>
                {pick.position}
                {pick.nfl_team ? <small>{pick.nfl_team}</small> : null}
              </td>
              <td>
                {pick.team_name ?? "Unknown roster"}
                <small>{pick.managerNames.join(" & ")}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
