import { describe, expect, it } from "vitest";

import type {
  DomainDataset,
  DomainLineupEntry,
  DomainManager,
  DomainSide,
  DomainTeam,
} from "../../server/domain/dataset";
import {
  calculateRecord,
  filterRecordDataset,
  recordDefinitions,
} from "../../server/domain/records";

const alex: DomainManager = { id: "person:alex", slug: "alex", name: "Alex" };
const brian: DomainManager = {
  id: "person:brian",
  slug: "brian",
  name: "Brian",
};

const teams: DomainTeam[] = [
  {
    id: "team:alex",
    slug: "alpha",
    name: "Alpha",
    seasonId: "season:2025",
    year: 2025,
    teamCount: 2,
    groupLabel: null,
    playoffSeed: null,
    finalPlace: 1,
    managers: [alex],
  },
  {
    id: "team:brian",
    slug: "bravo",
    name: "Bravo",
    seasonId: "season:2025",
    year: 2025,
    teamCount: 2,
    groupLabel: null,
    playoffSeed: null,
    finalPlace: 2,
    managers: [brian],
  },
];

function makeSide(
  game: number,
  owner: DomainManager,
  points: number,
  outcome: "win" | "loss" | "tie",
  phase: DomainSide["phase"] = "regular",
): DomainSide {
  const team = owner === alex ? teams[0] : teams[1];
  return {
    id: `side:${game}:${owner.id}`,
    matchupId: `matchup:${game}`,
    seasonId: "season:2025",
    year: 2025,
    week: game,
    phase,
    status: "final",
    teamId: team.id,
    teamName: team.name,
    teamSlug: team.slug,
    points,
    outcome,
    managers: [owner],
  };
}

const sides: DomainSide[] = Array.from({ length: 20 }, (_, index) => {
  const game = index + 1;
  const brianWins = game === 20;
  return [
    makeSide(
      game,
      alex,
      game === 1 ? 69.5 : 120 + game,
      brianWins ? "loss" : "win",
      game >= 19 ? "winners" : "regular",
    ),
    makeSide(
      game,
      brian,
      brianWins ? 160 : 80 + game,
      brianWins ? "win" : "loss",
      game >= 19 ? "winners" : "regular",
    ),
  ];
}).flat();

function lineup(
  id: string,
  manager: DomainManager,
  classification: "starter" | "bench",
  position: string,
  points: number,
): DomainLineupEntry {
  const team = manager === alex ? teams[0] : teams[1];
  return {
    id,
    matchupTeamId: sides[0].id,
    year: 2025,
    week: 1,
    phase: "regular",
    teamId: team.id,
    teamName: team.name,
    playerId: id.includes("bench") ? "player:bench" : "player:starter",
    playerName: id.includes("bench") ? "Bench Hero" : "Steady Starter",
    playerPosition: position,
    classification,
    points,
    managers: [manager],
  };
}

const lineups: DomainLineupEntry[] = [
  ...Array.from({ length: 10 }, (_, index) =>
    lineup(`starter:${index}`, alex, "starter", "WR", 2),
  ),
  lineup("bench:1", brian, "bench", "RB", 41.5),
  lineup("bench:qb", brian, "bench", "QB", 50),
];

const dataset: DomainDataset = {
  seasons: [
    {
      id: "season:2025",
      year: 2025,
      name: "2025",
      status: "complete",
      teamCount: 2,
      regularSeasonEndWeek: 19,
    },
  ],
  teams,
  sides,
  lineups,
};

describe("record catalog", () => {
  it("keeps stable unique slugs", () => {
    expect(recordDefinitions).toHaveLength(25);
    expect(new Set(recordDefinitions.map((record) => record.slug)).size).toBe(
      25,
    );
  });

  it.each(recordDefinitions.map((record) => record.slug))(
    "calculates a non-empty %s leaderboard from eligible facts",
    (slug) => {
      expect(calculateRecord(dataset, slug).length).toBeGreaterThan(0);
    },
  );

  it("credits Nice only to the manager whose team scored 69.xx", () => {
    expect(calculateRecord(dataset, "nice")).toMatchObject([
      { label: "Alex", value: 1 },
    ]);
  });

  it("excludes quarterbacks from Put Me In, Coach", () => {
    expect(calculateRecord(dataset, "put-me-in-coach")).toMatchObject([
      { label: "Bench Hero", value: 41.5 },
    ]);
  });

  it("uses a minimum of twenty decisions for manager percentage", () => {
    expect(calculateRecord(dataset, "best-manager-record")).toMatchObject([
      { label: "Alex", valueLabel: "95.0%" },
      { label: "Brian", valueLabel: "5.0%" },
    ]);
  });

  it("filters both matchup and lineup facts by season and phase", () => {
    const filtered = filterRecordDataset(dataset, {
      fromYear: 2025,
      toYear: 2025,
      phase: "postseason",
    });
    expect(filtered.sides).toHaveLength(4);
    expect(filtered.sides.every((side) => side.phase === "winners")).toBe(true);
    expect(filtered.lineups).toHaveLength(0);
  });

  it("credits each co-manager with the full team championship", () => {
    const coManager: DomainManager = {
      id: "person:casey",
      slug: "casey",
      name: "Casey",
    };
    const coManaged = {
      ...dataset,
      teams: [
        { ...dataset.teams[0], managers: [alex, coManager] },
        dataset.teams[1],
      ],
    };
    expect(calculateRecord(coManaged, "los-campeones")).toMatchObject([
      { rank: 1, label: "Alex", value: 1 },
      { rank: 1, label: "Casey", value: 1 },
    ]);
  });
});
