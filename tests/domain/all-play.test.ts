import { describe, expect, it } from "vitest";

import { calculateAllPlayStandings } from "../../server/domain/all-play";
import type {
  DomainManager,
  DomainSide,
  DomainTeam,
} from "../../server/domain/dataset";

const managers: DomainManager[] = ["Alex", "Brian", "Casey"].map((name) => ({
  id: `person:${name}`,
  slug: name.toLowerCase(),
  name,
}));
const teams: DomainTeam[] = managers.map((manager, index) => ({
  id: `team:${index + 1}`,
  slug: `team-${index + 1}`,
  name: `Team ${index + 1}`,
  seasonId: "season:2025",
  year: 2025,
  teamCount: 3,
  groupLabel: null,
  playoffSeed: null,
  finalPlace: null,
  managers: [manager],
}));

function side(
  teamIndex: number,
  week: number,
  points: number,
  outcome: "win" | "loss",
): DomainSide {
  const team = teams[teamIndex];
  return {
    id: `side:${week}:${teamIndex}`,
    matchupId: `matchup:${week}:${Math.floor(teamIndex / 2)}`,
    seasonId: "season:2025",
    year: 2025,
    week,
    phase: "regular",
    status: "final",
    teamId: team.id,
    teamName: team.name,
    teamSlug: team.slug,
    points,
    outcome,
    managers: team.managers,
  };
}

describe("all-play standings", () => {
  it("compares every active team score within each week", () => {
    const rows = calculateAllPlayStandings(teams, [
      side(0, 1, 110, "loss"),
      side(1, 1, 100, "win"),
      side(2, 1, 90, "loss"),
      side(0, 2, 80, "win"),
      side(1, 2, 120, "loss"),
      side(2, 2, 100, "win"),
    ]);

    expect(rows.map((row) => row.teamName)).toEqual([
      "Team 2",
      "Team 1",
      "Team 3",
    ]);
    expect(rows[0]).toMatchObject({
      allPlayWins: 3,
      allPlayLosses: 1,
      actualWins: 1,
      expectedWins: 1.5,
      luckDelta: -0.5,
    });
    expect(rows[1]).toMatchObject({
      allPlayWins: 2,
      allPlayLosses: 2,
      actualWins: 1,
      luckDelta: 0,
    });
  });
});
