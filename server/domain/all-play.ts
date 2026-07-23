import type { DomainSide, DomainTeam } from "./dataset";

export interface AllPlayStanding {
  rank: number;
  teamId: string;
  teamName: string;
  teamSlug: string;
  managerNames: string[];
  groupLabel: string | null;
  actualWins: number;
  actualLosses: number;
  actualTies: number;
  actualGames: number;
  allPlayWins: number;
  allPlayLosses: number;
  allPlayTies: number;
  allPlayGames: number;
  allPlayPercentage: number;
  expectedWins: number;
  luckDelta: number;
  pointsFor: number;
}

type MutableAllPlayStanding = Omit<
  AllPlayStanding,
  | "rank"
  | "actualGames"
  | "allPlayGames"
  | "allPlayPercentage"
  | "expectedWins"
  | "luckDelta"
>;

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateAllPlayStandings(
  teams: DomainTeam[],
  sides: DomainSide[],
): AllPlayStanding[] {
  const rows = new Map<string, MutableAllPlayStanding>(
    teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        teamName: team.name,
        teamSlug: team.slug,
        managerNames: team.managers.map((manager) => manager.name),
        groupLabel: team.groupLabel,
        actualWins: 0,
        actualLosses: 0,
        actualTies: 0,
        allPlayWins: 0,
        allPlayLosses: 0,
        allPlayTies: 0,
        pointsFor: 0,
      },
    ]),
  );
  const weeks = new Map<number, DomainSide[]>();
  for (const side of sides.filter(
    (candidate) =>
      candidate.phase === "regular" &&
      ["win", "loss", "tie"].includes(candidate.outcome),
  )) {
    const row = rows.get(side.teamId);
    if (!row) continue;
    if (side.outcome === "win") row.actualWins += 1;
    if (side.outcome === "loss") row.actualLosses += 1;
    if (side.outcome === "tie") row.actualTies += 1;
    row.pointsFor += side.points;
    const week = weeks.get(side.week) ?? [];
    week.push(side);
    weeks.set(side.week, week);
  }

  for (const week of weeks.values()) {
    const uniqueSides = [
      ...new Map(week.map((side) => [side.teamId, side])).values(),
    ];
    for (let leftIndex = 0; leftIndex < uniqueSides.length; leftIndex += 1) {
      const left = uniqueSides[leftIndex];
      if (!left) continue;
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < uniqueSides.length;
        rightIndex += 1
      ) {
        const right = uniqueSides[rightIndex];
        if (!right) continue;
        const leftRow = rows.get(left.teamId);
        const rightRow = rows.get(right.teamId);
        if (!leftRow || !rightRow) continue;
        if (left.points > right.points) {
          leftRow.allPlayWins += 1;
          rightRow.allPlayLosses += 1;
        } else if (right.points > left.points) {
          rightRow.allPlayWins += 1;
          leftRow.allPlayLosses += 1;
        } else {
          leftRow.allPlayTies += 1;
          rightRow.allPlayTies += 1;
        }
      }
    }
  }

  const calculated = [...rows.values()].map((row) => {
    const actualGames = row.actualWins + row.actualLosses + row.actualTies;
    const allPlayGames = row.allPlayWins + row.allPlayLosses + row.allPlayTies;
    const allPlayPercentage = allPlayGames
      ? (row.allPlayWins + row.allPlayTies * 0.5) / allPlayGames
      : 0;
    const expectedWins = actualGames * allPlayPercentage;
    const actualWins = row.actualWins + row.actualTies * 0.5;
    return {
      ...row,
      actualGames,
      allPlayGames,
      allPlayPercentage,
      expectedWins: rounded(expectedWins),
      luckDelta: rounded(actualWins - expectedWins),
      pointsFor: rounded(row.pointsFor),
    };
  });
  const sorted = calculated.sort(
    (left, right) =>
      right.allPlayPercentage - left.allPlayPercentage ||
      right.pointsFor - left.pointsFor ||
      left.teamName.localeCompare(right.teamName),
  );
  let previousKey = "";
  let rank = 0;
  return sorted.map((row, index) => {
    const key = `${row.allPlayPercentage}:${row.pointsFor}`;
    if (key !== previousKey) rank = index + 1;
    previousKey = key;
    return { rank, ...row };
  });
}
