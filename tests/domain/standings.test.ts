import { describe, expect, it } from "vitest";

import type {
  DomainManager,
  DomainSide,
  DomainTeam,
} from "../../server/domain/dataset";
import { calculateStandings } from "../../server/domain/standings";

const manager: DomainManager = { id: "person:a", slug: "alex", name: "Alex" };

function team(id: string, name: string): DomainTeam {
  return {
    id,
    slug: name.toLowerCase(),
    name,
    seasonId: "season:2025",
    year: 2025,
    teamCount: 3,
    groupLabel: null,
    playoffSeed: null,
    finalPlace: null,
    managers: [manager],
  };
}

function side(
  matchupId: string,
  teamId: string,
  points: number,
  outcome: DomainSide["outcome"],
  phase = "regular",
): DomainSide {
  return {
    id: `${matchupId}:${teamId}`,
    matchupId,
    seasonId: "season:2025",
    year: 2025,
    week: 1,
    phase,
    status: "final",
    teamId,
    teamName: teamId,
    teamSlug: teamId,
    points,
    outcome,
    managers: [manager],
  };
}

describe("calculateStandings", () => {
  it("uses wins, ties, then points and assigns competition ranks", () => {
    const teams = [
      team("a", "Alpha"),
      team("b", "Bravo"),
      team("c", "Charlie"),
    ];
    const sides = [
      side("m1", "a", 100.12, "win"),
      side("m1", "b", 90.34, "loss"),
      side("m2", "c", 100.12, "win"),
      side("m2", "b", 80, "loss"),
    ];

    expect(calculateStandings(teams, sides)).toMatchObject([
      { rank: 1, teamId: "a", wins: 1, pointsFor: 100.12 },
      { rank: 1, teamId: "c", wins: 1, pointsFor: 100.12 },
      { rank: 3, teamId: "b", losses: 2, pointsAgainst: 200.24 },
    ]);
  });

  it("ignores postseason games and malformed one-sided matchups", () => {
    const teams = [team("a", "Alpha"), team("b", "Bravo")];
    const sides = [
      side("m1", "a", 120, "win", "winners"),
      side("m1", "b", 100, "loss", "winners"),
      side("m2", "a", 75, "bye"),
    ];

    expect(calculateStandings(teams, sides)).toMatchObject([
      { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 },
      { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 },
    ]);
  });

  it("honors the season manifest tiebreaker order", () => {
    const teams = [team("a", "Alpha"), team("b", "Bravo")];
    const sides = [
      side("m1", "a", 90, "tie"),
      side("m1", "b", 90, "tie"),
      side("m2", "a", 110, "loss"),
      side("m2", "b", 120, "win"),
      side("m3", "a", 71, "win"),
      side("m3", "b", 70, "loss"),
    ];

    expect(
      calculateStandings(teams, sides, [
        "wins",
        "ties",
        "display_name",
        "points_for",
      ]).map((row) => row.teamId),
    ).toEqual(["a", "b"]);
    expect(calculateStandings(teams, sides)[0]?.teamId).toBe("b");
  });

  it("uses complete, unique official seed data when available", () => {
    const alpha = { ...team("a", "Alpha"), playoffSeed: 2 };
    const bravo = { ...team("b", "Bravo"), playoffSeed: 1 };
    const rows = calculateStandings(
      [alpha, bravo],
      [side("m1", "a", 120, "win"), side("m1", "b", 80, "loss")],
    );

    expect(rows.map((row) => [row.teamId, row.rank, row.rankSource])).toEqual([
      ["b", 1, "official"],
      ["a", 2, "official"],
    ]);
  });
});
