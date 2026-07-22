import { Link } from "react-router";

import { StatusPill } from "./status-pill";

export interface ScoreSide {
  id: string;
  teamName: string;
  teamSlug: string;
  points: number;
  outcome: string;
  managers: { slug: string; name: string }[];
}

export interface ScoreMatchup {
  id: string;
  year: number;
  week: number;
  phase: string;
  placementLabel?: string | null;
  status: string;
  sides: ScoreSide[];
}

export function Scoreboard({ matchups }: { matchups: ScoreMatchup[] }) {
  if (!matchups.length) {
    return <div className="empty-state">No matchups are on the board yet.</div>;
  }
  return (
    <div className="score-grid">
      {matchups.map((matchup) => (
        <article className="score-card" key={matchup.id}>
          <div className="score-card-meta">
            <span>
              {matchup.placementLabel ?? matchup.phase.replaceAll("_", " ")}
            </span>
            <StatusPill status={matchup.status} />
          </div>
          <div className="score-lines">
            {matchup.sides.map((side) => (
              <div
                className={`score-line outcome-${side.outcome}`}
                key={side.id}
              >
                <div>
                  <strong>{side.teamName}</strong>
                  <span>
                    {side.managers.map((manager, index) => (
                      <span key={manager.slug}>
                        {index ? " & " : ""}
                        <Link to={`/managers/${manager.slug}`}>
                          {manager.name}
                        </Link>
                      </span>
                    ))}
                  </span>
                </div>
                <b className="score-number">{side.points.toFixed(2)}</b>
              </div>
            ))}
          </div>
          <Link className="card-link" to={`/matchups/${matchup.id}`}>
            Box score <span aria-hidden="true">→</span>
          </Link>
        </article>
      ))}
    </div>
  );
}
