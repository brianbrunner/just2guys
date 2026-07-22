import { describe, expect, it } from "vitest";

import season2025 from "../config/seasons/2025.json";
import { seasonManifestSchema } from "../server/manifests/schema";
import { SleeperApiError, type SleeperClient } from "../server/sleeper/client";
import {
  sleeperLeagueSchema,
  sleeperMatchupSchema,
} from "../server/sleeper/schemas";
import { syncWeek } from "../server/sync/scheduled";

describe("scheduled synchronization", () => {
  it("performs no database work when one upstream week request fails", async () => {
    let databaseCalls = 0;
    const database = {
      prepare() {
        databaseCalls += 1;
        throw new Error("Database must not be touched after a partial fetch");
      },
      batch() {
        databaseCalls += 1;
        return Promise.resolve([]);
      },
    } as unknown as D1Database;
    const league = sleeperLeagueSchema.parse({
      league_id: season2025.sources[0].externalId,
      name: "Just 2 Guys 2025",
      season: "2025",
      status: "complete",
      previous_league_id: null,
      roster_positions: [],
      settings: {
        num_teams: 14,
        playoff_week_start: 15,
        last_scored_leg: 17,
      },
      scoring_settings: {},
    });
    const client = {
      league: () => Promise.resolve(league),
      matchups: () =>
        Promise.reject(
          new SleeperApiError("temporary matchup failure", "upstream", 503),
        ),
      winnersBracket: () => Promise.resolve([]),
      losersBracket: () => Promise.resolve([]),
    } as unknown as SleeperClient;
    const manifest = seasonManifestSchema.parse(season2025);

    await expect(
      syncWeek({
        env: {
          DB: database,
          ACTIVE_SEASON: "2025",
          STALE_AFTER_SECONDS: "2700",
        },
        client,
        seasonYear: 2025,
        source: manifest.sources[0],
        sourceId: "source:test",
        observedAt: "2026-07-21T20:00:00.000Z",
        sourceWeek: 17,
      }),
    ).rejects.toThrow("temporary matchup failure");
    expect(databaseCalls).toBe(0);
  });

  it("invalidates record results when a changed final score is written", async () => {
    const observedAt = "2026-07-21T20:00:00.000Z";
    const preparedQueries: string[] = [];
    const preparedBindings: Array<{ query: string; values: unknown[] }> = [];
    const batchedQueries: string[] = [];
    const manifest = seasonManifestSchema.parse(season2025);
    const source = manifest.sources[0];
    const statement = (query: string) => ({
      query,
      bind(...values: unknown[]) {
        preparedBindings.push({ query, values });
        return this;
      },
      first() {
        if (query.includes("entity_type='league_rosters'"))
          return Promise.resolve({
            content_hash: "unchanged-rosters",
            observed_at: observedAt,
            payload_json: JSON.stringify({
              rosters: [1, 2].map((roster_id) => ({
                roster_id,
                owner_id: null,
                reserve: roster_id === 1 ? ["reserve-player"] : [],
                settings: {},
              })),
            }),
          });
        if (query.includes("entity_type = 'matchup_week'"))
          return Promise.resolve({ content_hash: "previous-final-score" });
        if (query.includes("entity_type = 'player_directory'"))
          return Promise.resolve({ observed_at: observedAt });
        return Promise.resolve(null);
      },
      all() {
        if (query.includes("FROM source_rosters"))
          return Promise.resolve({
            results: [1, 2].map((rosterId) => ({
              id: `source-roster:${rosterId}`,
              season_team_id: `season-team:${rosterId}`,
              external_roster_id: `${source.externalId}:${rosterId}`,
            })),
          });
        return Promise.resolve({ results: [] });
      },
      run() {
        return Promise.resolve({ meta: { changes: 1 } });
      },
    });
    const database = {
      prepare(query: string) {
        preparedQueries.push(query);
        return statement(query);
      },
      batch(statements: { query: string }[]) {
        batchedQueries.push(...statements.map((item) => item.query));
        return Promise.resolve(
          statements.map(() => ({ meta: { changes: 1 } })),
        );
      },
    } as unknown as D1Database;
    const league = sleeperLeagueSchema.parse({
      league_id: source.externalId,
      name: "Just 2 Guys 2025",
      season: "2025",
      status: "complete",
      previous_league_id: null,
      roster_positions: [],
      settings: {
        num_teams: 14,
        playoff_week_start: 15,
        last_scored_leg: 17,
      },
      scoring_settings: {},
    });
    const matchups = [
      sleeperMatchupSchema.parse({
        roster_id: 1,
        matchup_id: 1,
        points: 111.1,
        starters: [],
        players: ["reserve-player"],
        players_points: { "reserve-player": 4.2 },
      }),
      sleeperMatchupSchema.parse({
        roster_id: 2,
        matchup_id: 1,
        points: 109.9,
        starters: [],
        players: [],
        players_points: {},
      }),
    ];
    const client = {
      league: () => Promise.resolve(league),
      matchups: () => Promise.resolve(matchups),
      winnersBracket: () => Promise.resolve([]),
      losersBracket: () => Promise.resolve([]),
    } as unknown as SleeperClient;

    const result = await syncWeek({
      env: {
        DB: database,
        ACTIVE_SEASON: "2025",
        STALE_AFTER_SECONDS: "2700",
      },
      client,
      seasonYear: 2025,
      source,
      sourceId: "source:test",
      observedAt,
      sourceWeek: 17,
    });

    expect(result.changed).toBe(true);
    expect(
      preparedQueries.some((query) => query.includes("matchup_week")),
    ).toBe(true);
    expect(
      batchedQueries.some((query) =>
        query.includes("DELETE FROM derived_results WHERE kind='record'"),
      ),
    ).toBe(true);
    expect(
      batchedQueries.some((query) =>
        query.includes("INSERT INTO matchup_teams"),
      ),
    ).toBe(true);
    expect(
      preparedBindings.some(
        ({ query, values }) =>
          query.includes("INSERT INTO lineup_entries") &&
          values[3] === "IR" &&
          values[4] === "ir",
      ),
    ).toBe(true);
  });
});
