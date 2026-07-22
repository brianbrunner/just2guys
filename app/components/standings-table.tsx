import { Link } from "react-router";

interface StandingRow {
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

export function StandingsTable({
  rows,
  year,
}: {
  rows: StandingRow[];
  year: number;
}) {
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
            <th scope="col">#</th>
            <th scope="col">Club</th>
            <th scope="col">W</th>
            <th scope="col">L</th>
            <th scope="col">T</th>
            <th scope="col">PF</th>
            <th scope="col">PA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
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
