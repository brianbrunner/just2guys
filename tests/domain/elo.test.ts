import { describe, expect, it } from "vitest";

import type { DomainManager, DomainSide } from "../../server/domain/dataset";
import {
  calculateManagerElo,
  ELO_INITIAL_RATING,
} from "../../server/domain/elo";

const alex: DomainManager = { id: "alex", slug: "alex", name: "Alex" };
const blake: DomainManager = { id: "blake", slug: "blake", name: "Blake" };
const casey: DomainManager = { id: "casey", slug: "casey", name: "Casey" };

function game(input: {
  id: string;
  year?: number;
  week?: number;
  phase?: string;
  status?: string;
  leftManagers?: DomainManager[];
  rightManagers?: DomainManager[];
  leftOutcome?: "win" | "loss" | "tie";
}): DomainSide[] {
  const leftOutcome = input.leftOutcome ?? "win";
  const rightOutcome =
    leftOutcome === "win" ? "loss" : leftOutcome === "loss" ? "win" : "tie";
  const common = {
    matchupId: input.id,
    seasonId: `season-${input.year ?? 2025}`,
    year: input.year ?? 2025,
    week: input.week ?? 1,
    phase: input.phase ?? "regular",
    status: input.status ?? "final",
    points: 100,
  };
  return [
    {
      ...common,
      id: `${input.id}:left`,
      teamId: `${input.id}:left-team`,
      teamName: "Left",
      teamSlug: "left",
      outcome: leftOutcome,
      managers: input.leftManagers ?? [alex],
    },
    {
      ...common,
      id: `${input.id}:right`,
      teamId: `${input.id}:right-team`,
      teamName: "Right",
      teamSlug: "right",
      outcome: rightOutcome,
      managers: input.rightManagers ?? [blake],
    },
  ];
}

describe("manager Elo", () => {
  it("starts managers at 1500 and moves ten points for an even matchup", () => {
    const ratings = calculateManagerElo(game({ id: "one" }));
    expect(ratings.get(alex.id)?.current).toBe(1510);
    expect(ratings.get(blake.id)?.current).toBe(1490);
    expect(ratings.get(alex.id)?.history[0]).toMatchObject({
      rating: 1510,
      delta: 10,
      outcome: "win",
      opponents: "Blake",
    });
  });

  it("replays games chronologically and rewards an upset more", () => {
    const ratings = calculateManagerElo([
      ...game({ id: "later", year: 2025, week: 2, leftOutcome: "loss" }),
      ...game({ id: "earlier", year: 2025, week: 1 }),
    ]);
    const blakeRating = ratings.get(blake.id);
    expect(blakeRating?.history.map((point) => point.matchupId)).toEqual([
      "earlier",
      "later",
    ]);
    expect(blakeRating?.history[1]?.delta).toBeGreaterThan(10);
    expect(blakeRating?.current).toBeGreaterThan(ELO_INITIAL_RATING);
  });

  it("gives co-managers the same team-level adjustment", () => {
    const ratings = calculateManagerElo(
      game({ id: "co-managed", leftManagers: [alex, casey] }),
    );
    expect(ratings.get(alex.id)?.current).toBe(1510);
    expect(ratings.get(casey.id)?.current).toBe(1510);
    expect(ratings.get(blake.id)?.current).toBe(1490);
  });

  it("ignores placement, live, and one-sided source facts", () => {
    const ratings = calculateManagerElo([
      ...game({ id: "placement", phase: "placement" }),
      ...game({ id: "live", status: "live" }),
      game({ id: "one-sided" })[0],
    ]);
    expect(ratings.size).toBe(0);
  });
});
