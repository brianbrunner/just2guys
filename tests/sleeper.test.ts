import { describe, expect, it } from "vitest";

import season2025 from "../config/seasons/2025.json";
import { seasonManifestSchema } from "../server/manifests/schema";
import {
  adaptSleeperWeek,
  canonicalWeekForSource,
  sourcesForCanonicalWeek,
  sleeperOutcome,
  sleeperPoints,
} from "../server/sleeper/adapter";
import {
  contentHash,
  SleeperApiError,
  SleeperClient,
} from "../server/sleeper/client";
import {
  sleeperBracketMatchSchema,
  sleeperLeagueSchema,
  sleeperMatchupSchema,
} from "../server/sleeper/schemas";

const league = sleeperLeagueSchema.parse({
  league_id: "league",
  name: "League",
  season: "2025",
  status: "complete",
  previous_league_id: null,
  roster_positions: [],
  settings: { num_teams: 2, playoff_week_start: 15, last_scored_leg: 17 },
  scoring_settings: {},
});

function matchup(
  rosterId: number,
  points: number,
  matchupId: number | null = 1,
) {
  return sleeperMatchupSchema.parse({
    roster_id: rosterId,
    matchup_id: matchupId,
    points,
    starters: null,
    players: null,
    players_points: null,
  });
}

describe("Sleeper boundary adapter", () => {
  it("tolerates the null arrays returned by fake or empty leagues", () => {
    expect(matchup(1, 0).starters).toEqual([]);
    expect(matchup(1, 0).players_points).toEqual({});
    expect(
      sleeperBracketMatchSchema.parse({ r: 1, m: 1, t1: null, t2: null }),
    ).toMatchObject({ t1: null, t2: null });
  });

  it("tolerates unknown upstream fields but rejects missing required facts", () => {
    expect(
      sleeperMatchupSchema.parse({
        roster_id: 1,
        matchup_id: 1,
        points: 10,
        starters: null,
        players: null,
        players_points: null,
        future_api_field: "safe to ignore",
      }).roster_id,
    ).toBe(1);
    expect(() => sleeperMatchupSchema.parse({ matchup_id: 1 })).toThrow();
  });

  it("hashes object payloads independently of key order", async () => {
    await expect(contentHash({ b: 2, a: { d: 4, c: 3 } })).resolves.toBe(
      await contentHash({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it("invokes fetch with the runtime global as its receiver", async () => {
    const fetcher = function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(
        Response.json({
          week: 0,
          season: "2026",
          season_type: "pre",
        }),
      );
    } as typeof fetch;

    await expect(new SleeperClient(fetcher).nflState()).resolves.toMatchObject({
      season: "2026",
    });
  });

  it("retries a transient upstream failure and validates the recovery payload", async () => {
    let attempts = 0;
    const fetcher: typeof fetch = () => {
      attempts += 1;
      return Promise.resolve(
        attempts === 1
          ? new Response("delayed", { status: 503 })
          : Response.json({
              week: 7,
              season: "2026",
              season_type: "regular",
            }),
      );
    };
    const client = new SleeperClient(fetcher);

    await expect(client.nflState()).resolves.toMatchObject({
      week: 7,
      season: "2026",
    });
    expect(attempts).toBe(2);
    expect(client.requestCount).toBe(2);
  });

  it("does not retry an invalid upstream payload", async () => {
    let attempts = 0;
    const client = new SleeperClient(() => {
      attempts += 1;
      return Promise.resolve(Response.json({ week: "not-a-number" }));
    });

    await expect(client.nflState()).rejects.toMatchObject({
      category: "validation",
    } satisfies Partial<SleeperApiError>);
    expect(attempts).toBe(1);
  });

  it("classifies bracket games and outcomes without league-name guesses", () => {
    const left = matchup(1, 120);
    const right = matchup(2, 100);
    const result = adaptSleeperWeek({
      leagueId: "league",
      week: 15,
      manifest: seasonManifestSchema.parse(season2025),
      league,
      matchups: [right, left],
      winnersBracket: [{ r: 1, m: 1, t1: 1, t2: 2, p: 1 }],
      losersBracket: [],
      observedWeek: 15,
    });

    expect(result).toMatchObject([
      {
        phase: "winners",
        status: "final",
        sides: [{ roster_id: 1 }, { roster_id: 2 }],
      },
    ]);
    expect(sleeperOutcome(left, right)).toBe("win");
    expect(sleeperOutcome(right, left)).toBe("loss");
  });

  it("excludes postseason placement games that no longer affect the title or last place", () => {
    const winnersBracket = [
      { r: 1, m: 1, t1: 1, t2: 2 },
      { r: 1, m: 2, t1: 3, t2: 4 },
      { r: 1, m: 3, t1: 5, t2: 6 },
      { r: 1, m: 4, t1: 7, t2: 8 },
      { r: 2, m: 5, t1: 1, t2: 3, t1_from: { w: 1 }, t2_from: { w: 2 } },
      { r: 2, m: 6, t1: 5, t2: 7, t1_from: { w: 3 }, t2_from: { w: 4 } },
      { r: 2, m: 7, t1: 2, t2: 4, t1_from: { l: 1 }, t2_from: { l: 2 } },
      { r: 2, m: 8, t1: 6, t2: 8, t1_from: { l: 3 }, t2_from: { l: 4 } },
      { r: 3, m: 9, t1: 1, t2: 5, p: 1, t1_from: { w: 5 }, t2_from: { w: 6 } },
      { r: 3, m: 10, t1: 3, t2: 7, p: 3, t1_from: { l: 5 }, t2_from: { l: 6 } },
      { r: 3, m: 11, t1: 2, t2: 6, p: 5, t1_from: { w: 7 }, t2_from: { w: 8 } },
      { r: 3, m: 12, t1: 4, t2: 8, p: 7, t1_from: { l: 7 }, t2_from: { l: 8 } },
    ];
    const losersBracket = [
      { r: 1, m: 1, t1: 9, t2: 10 },
      { r: 1, m: 2, t1: 11, t2: 12 },
      { r: 2, m: 3, t1: 13, t2: 9, t2_from: { w: 1 } },
      { r: 2, m: 4, t1: 14, t2: 11, t2_from: { w: 2 } },
      {
        r: 2,
        m: 5,
        t1: 10,
        t2: 12,
        p: 5,
        t1_from: { l: 1 },
        t2_from: { l: 2 },
      },
      {
        r: 3,
        m: 6,
        t1: 13,
        t2: 14,
        p: 1,
        t1_from: { w: 3 },
        t2_from: { w: 4 },
      },
      { r: 3, m: 7, t1: 9, t2: 11, p: 3, t1_from: { l: 3 }, t2_from: { l: 4 } },
    ];
    const adapt = (pairs: Array<[number, number]>, week: number) =>
      adaptSleeperWeek({
        leagueId: "league",
        week,
        manifest: seasonManifestSchema.parse(season2025),
        league,
        matchups: pairs.flatMap(([left, right], index) => [
          matchup(left, 120, index + 1),
          matchup(right, 100, index + 1),
        ]),
        winnersBracket,
        losersBracket,
        observedWeek: week,
      }).map((game) => game.phase);

    expect(
      adapt(
        [
          [1, 3],
          [5, 7],
          [2, 4],
          [6, 8],
        ],
        16,
      ),
    ).toEqual(["winners", "winners", "placement", "placement"]);
    expect(
      adapt(
        [
          [1, 5],
          [3, 7],
          [2, 6],
          [4, 8],
        ],
        17,
      ),
    ).toEqual(["winners", "consolation", "placement", "placement"]);
    expect(
      adapt(
        [
          [9, 10],
          [11, 12],
        ],
        15,
      ),
    ).toEqual(["losers", "losers"]);
    expect(
      adapt(
        [
          [13, 9],
          [14, 11],
          [10, 12],
        ],
        16,
      ),
    ).toEqual(["losers", "losers", "placement"]);
    expect(
      adapt(
        [
          [13, 14],
          [9, 11],
        ],
        17,
      ),
    ).toEqual(["losers", "placement"]);
  });

  it("uses reviewed platform points for a source week with bad custom totals", () => {
    const manifest = seasonManifestSchema.parse({
      ...season2025,
      sources: [
        {
          ...season2025.sources[0],
          platformScoreWeeks: [14],
        },
      ],
    });
    const source = manifest.sources[0];
    const left = sleeperMatchupSchema.parse({
      ...matchup(1, 120),
      custom_points: 0,
    });
    const right = sleeperMatchupSchema.parse({
      ...matchup(2, 100),
      custom_points: 0,
    });

    expect(sleeperPoints(left, source, 14)).toBe(120);
    expect(sleeperOutcome(left, right, source, 14)).toBe("win");
    expect(sleeperPoints(left, source, 13)).toBe(0);
  });

  it("marks one-sided source rows as byes", () => {
    const [result] = adaptSleeperWeek({
      leagueId: "league",
      week: 2,
      manifest: seasonManifestSchema.parse(season2025),
      league,
      matchups: [matchup(1, 0, null)],
      winnersBracket: [],
      losersBracket: [],
      observedWeek: 2,
    });
    expect(result.status).toBe("bye");
  });

  it("maps source weeks into canonical weeks without changing source identity", () => {
    const manifest = seasonManifestSchema.parse(season2025);
    const source = {
      ...manifest.sources[0],
      canonicalWeekOffset: 1,
      sourceWeekStart: 1,
      sourceWeekEnd: 16,
    };
    const [result] = adaptSleeperWeek({
      leagueId: "repair-league",
      week: 16,
      source,
      manifest,
      league,
      matchups: [matchup(1, 120), matchup(2, 100)],
      winnersBracket: [],
      losersBracket: [],
      observedWeek: 16,
    });

    expect(canonicalWeekForSource(source, 16)).toBe(17);
    expect(result.week).toBe(17);
    expect(result.externalId).toBe("repair-league:16:1");
  });

  it("selects every grouped source that contributes to a canonical week", () => {
    const base = seasonManifestSchema.parse(season2025);
    const manifest = seasonManifestSchema.parse({
      ...base,
      sources: [
        { ...base.sources[0], externalId: "group-a", groupLabel: "A" },
        {
          ...base.sources[0],
          externalId: "group-b",
          groupLabel: "B",
          weekMap: { "16": 17 },
          sourceWeekEnd: 16,
        },
      ],
    });

    expect(
      sourcesForCanonicalWeek(manifest, 17).map(({ source, sourceWeek }) => [
        source.externalId,
        sourceWeek,
      ]),
    ).toEqual([
      ["group-a", 17],
      ["group-b", 16],
    ]);
  });
});
