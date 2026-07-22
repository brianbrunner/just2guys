import type { DomainSide, DomainTeam } from "./dataset";

export interface Standing {
  rank: number;
  teamId: string;
  teamName: string;
  teamSlug: string;
  managerNames: string[];
  groupLabel: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  rankSource: "official" | "reconstructed";
}

export type StandingsTiebreaker =
  "wins" | "ties" | "points_for" | "points_against" | "display_name";

const defaultTiebreakers: StandingsTiebreaker[] = [
  "wins",
  "ties",
  "points_for",
  "display_name",
];

function compareBy(
  left: Omit<Standing, "rank" | "rankSource">,
  right: Omit<Standing, "rank" | "rankSource">,
  tiebreaker: StandingsTiebreaker,
) {
  if (tiebreaker === "wins") return right.wins - left.wins;
  if (tiebreaker === "ties") return right.ties - left.ties;
  if (tiebreaker === "points_for") return right.pointsFor - left.pointsFor;
  // A season must opt in to points against. When it does, allowing fewer
  // opponent points is the favorable result.
  if (tiebreaker === "points_against")
    return left.pointsAgainst - right.pointsAgainst;
  return left.teamName.localeCompare(right.teamName);
}

export function calculateStandings(
  teams: DomainTeam[],
  sides: DomainSide[],
  tiebreakers: StandingsTiebreaker[] = defaultTiebreakers,
): Standing[] {
  const rows = new Map(
    teams.map((team) => [
      team.id,
      {
        rank: 0,
        teamId: team.id,
        teamName: team.name,
        teamSlug: team.slug,
        managerNames: team.managers.map((manager) => manager.name),
        groupLabel: team.groupLabel,
        playoffSeed: team.playoffSeed,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      },
    ]),
  );
  const groups = new Map<string, DomainSide[]>();
  for (const side of sides.filter(
    (candidate) => candidate.phase === "regular",
  )) {
    const group = groups.get(side.matchupId) ?? [];
    group.push(side);
    groups.set(side.matchupId, group);
  }
  for (const pair of groups.values()) {
    if (pair.length !== 2) continue;
    for (const [index, side] of pair.entries()) {
      const row = rows.get(side.teamId);
      if (!row) continue;
      row.pointsFor += side.points;
      row.pointsAgainst += pair[index === 0 ? 1 : 0].points;
      if (side.outcome === "win") row.wins += 1;
      if (side.outcome === "loss") row.losses += 1;
      if (side.outcome === "tie") row.ties += 1;
    }
  }
  const seeds = teams.map((team) => team.playoffSeed);
  const hasOfficialRanks =
    seeds.length > 0 &&
    seeds.every((seed): seed is number => seed !== null) &&
    new Set(seeds).size === seeds.length;
  const requested = tiebreakers.length ? tiebreakers : defaultTiebreakers;
  const stableOrder = requested.includes("display_name")
    ? requested
    : [...requested, "display_name" as const];
  const sorted = [...rows.values()].sort((left, right) => {
    if (hasOfficialRanks)
      return (left.playoffSeed ?? 0) - (right.playoffSeed ?? 0);
    for (const rule of stableOrder) {
      const result = compareBy(left, right, rule);
      if (result) return result;
    }
    return left.teamId.localeCompare(right.teamId);
  });
  let lastKey = "";
  let rank = 0;
  return sorted.map((row, index) => {
    const key = hasOfficialRanks
      ? String(row.playoffSeed)
      : requested
          .filter((rule) => rule !== "display_name")
          .map((rule) => {
            if (rule === "wins") return row.wins;
            if (rule === "ties") return row.ties;
            if (rule === "points_for") return row.pointsFor;
            return row.pointsAgainst;
          })
          .join(":");
    if (key !== lastKey)
      rank = hasOfficialRanks ? (row.playoffSeed ?? 0) : index + 1;
    lastKey = key;
    return {
      ...row,
      rank,
      rankSource: hasOfficialRanks ? "official" : "reconstructed",
      pointsFor: Math.round(row.pointsFor * 100) / 100,
      pointsAgainst: Math.round(row.pointsAgainst * 100) / 100,
    };
  });
}
