import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface LegacySeasonReport {
  year: number;
  teams: number;
  managers: number;
  matchups: number;
  lineupEntries: number;
  championExternalRosterId: string;
  lastPlaceExternalRosterId: string;
  unresolvedIdentities: number;
  scoreLineupDiscrepancies: unknown[];
}

const migration = readFileSync(
  new URL(
    "../server/db/migrations/0000_friendly_tyger_tiger.sql",
    import.meta.url,
  ),
  "utf8",
).replaceAll("--> statement-breakpoint", "");
const legacySql = readFileSync(
  new URL("../generated/legacy-import/legacy-import.sql", import.meta.url),
  "utf8",
);
const sleeperSql = readFileSync(
  new URL("../generated/sleeper-backfill/sleeper-import.sql", import.meta.url),
  "utf8",
);
const reconciliation = JSON.parse(
  readFileSync(
    new URL("../generated/legacy-import/reconciliation.json", import.meta.url),
    "utf8",
  ),
) as { seasons: LegacySeasonReport[] };

let database: DatabaseSync;

function counts() {
  return database
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM seasons) seasons,
        (SELECT COUNT(*) FROM season_teams) teams,
        (SELECT COUNT(*) FROM matchups) matchups,
        (SELECT COUNT(*) FROM lineup_entries) lineups`,
    )
    .get();
}

beforeAll(() => {
  database = new DatabaseSync(":memory:");
  database.exec(migration);
});

afterAll(() => database.close());

describe.sequential("canonical import", () => {
  it("matches every Yahoo season's golden counts and reviewed outcomes", () => {
    database.exec(legacySql);
    const actual = database
      .prepare(
        `SELECT s.year,
          (SELECT COUNT(*) FROM season_teams st WHERE st.season_id=s.id) teams,
          (SELECT COUNT(DISTINCT stm.person_id) FROM season_team_managers stm
             JOIN season_teams st ON st.id=stm.season_team_id WHERE st.season_id=s.id) managers,
          (SELECT COUNT(*) FROM matchups m WHERE m.season_id=s.id) matchups,
          (SELECT COUNT(*) FROM lineup_entries le
             JOIN matchup_teams mt ON mt.id=le.matchup_team_id
             JOIN matchups m ON m.id=mt.matchup_id WHERE m.season_id=s.id) lineupEntries,
          (SELECT sr.external_roster_id FROM season_teams st
             JOIN source_rosters sr ON sr.season_team_id=st.id
             WHERE st.season_id=s.id AND st.final_place=1 LIMIT 1) champion,
          (SELECT sr.external_roster_id FROM season_teams st
             JOIN source_rosters sr ON sr.season_team_id=st.id
             WHERE st.season_id=s.id AND st.final_place=s.team_count LIMIT 1) lastPlace
         FROM seasons s WHERE s.year BETWEEN 2013 AND 2020 ORDER BY s.year`,
      )
      .all() as Array<{
      year: number;
      teams: number;
      managers: number;
      matchups: number;
      lineupEntries: number;
      champion: string;
      lastPlace: string;
    }>;
    expect(actual).toEqual(
      reconciliation.seasons.map((season) => ({
        year: season.year,
        teams: season.teams,
        managers: season.managers,
        matchups: season.matchups,
        lineupEntries: season.lineupEntries,
        champion: season.championExternalRosterId,
        lastPlace: season.lastPlaceExternalRosterId,
      })),
    );
    expect(
      reconciliation.seasons.every(
        (season) =>
          season.unresolvedIdentities === 0 &&
          season.scoreLineupDiscrepancies.length === 0,
      ),
    ).toBe(true);
  });

  it("excludes unused legacy players and preserves both 2019/2020 groups", () => {
    expect(
      database.prepare("SELECT COUNT(*) count FROM players").get(),
    ).toEqual({ count: 761 });
    expect(
      database
        .prepare(
          `SELECT s.year, COUNT(DISTINCT st.group_label) groups
           FROM season_teams st JOIN seasons s ON s.id=st.season_id
           WHERE s.year IN (2019, 2020) GROUP BY s.year ORDER BY s.year`,
        )
        .all(),
    ).toEqual([
      { year: 2019, groups: 2 },
      { year: 2020, groups: 2 },
    ]);
    expect(
      database
        .prepare(
          `SELECT COUNT(*) count FROM provider_accounts pa
           JOIN source_roster_accounts sra ON sra.provider_account_id=pa.id
           JOIN source_rosters sr ON sr.id=sra.source_roster_id
           JOIN season_sources ss ON ss.id=sr.season_source_id
           JOIN seasons s ON s.id=ss.season_id
           WHERE s.year <= 2020 AND pa.person_id IS NULL`,
        )
        .get(),
    ).toEqual({ count: 0 });
  });

  it("is idempotent for both Yahoo and Sleeper imports", () => {
    database.exec(sleeperSql);
    const once = counts();
    database.exec(legacySql);
    database.exec(sleeperSql);
    expect(counts()).toEqual(once);
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(once).toEqual({
      seasons: 14,
      teams: 210,
      matchups: 1668,
      lineups: 45853,
    });
  });

  it("stitches the reviewed 2021 and 2022 conference title games", () => {
    expect(
      database
        .prepare(
          `SELECT s.year, champion.preferred_name champion,
                  last_place.preferred_name last_place
           FROM seasons s
           JOIN season_teams champion_team
             ON champion_team.season_id=s.id AND champion_team.final_place=1
           JOIN season_team_managers champion_manager
             ON champion_manager.season_team_id=champion_team.id
           JOIN people champion ON champion.id=champion_manager.person_id
           JOIN season_teams last_team
             ON last_team.season_id=s.id AND last_team.final_place=s.team_count
           JOIN season_team_managers last_manager
             ON last_manager.season_team_id=last_team.id
           JOIN people last_place ON last_place.id=last_manager.person_id
           WHERE s.year IN (2021, 2022) ORDER BY s.year`,
        )
        .all(),
    ).toEqual([
      { year: 2021, champion: "Rob", last_place: "Breanna" },
      { year: 2022, champion: "Brian K", last_place: "Julio" },
    ]);
    expect(
      database
        .prepare(
          `SELECT s.year, m.external_id matchup, mt.side,
                  p.preferred_name manager, mt.points, mt.outcome
           FROM matchups m
           JOIN seasons s ON s.id=m.season_id
           JOIN matchup_teams mt ON mt.matchup_id=m.id
           JOIN season_team_managers stm ON stm.season_team_id=mt.season_team_id
           JOIN people p ON p.id=stm.person_id
           WHERE m.external_id LIKE 'stitched:%'
           ORDER BY s.year, m.external_id, mt.side`,
        )
        .all(),
    ).toEqual([
      {
        year: 2021,
        matchup: "stitched:2021:ultimate-championship",
        side: 1,
        manager: "Brian B",
        points: 126.26,
        outcome: "loss",
      },
      {
        year: 2021,
        matchup: "stitched:2021:ultimate-championship",
        side: 2,
        manager: "Rob",
        points: 155.1,
        outcome: "win",
      },
      {
        year: 2021,
        matchup: "stitched:2021:ultimate-last-place",
        side: 1,
        manager: "Manoli",
        points: 134.2,
        outcome: "win",
      },
      {
        year: 2021,
        matchup: "stitched:2021:ultimate-last-place",
        side: 2,
        manager: "Breanna",
        points: 117.54,
        outcome: "loss",
      },
      {
        year: 2022,
        matchup: "stitched:2022:ultimate-championship",
        side: 1,
        manager: "Brian K",
        points: 110.08,
        outcome: "win",
      },
      {
        year: 2022,
        matchup: "stitched:2022:ultimate-championship",
        side: 2,
        manager: "Manoli",
        points: 98.68,
        outcome: "loss",
      },
      {
        year: 2022,
        matchup: "stitched:2022:ultimate-last-place",
        side: 1,
        manager: "Julio",
        points: 69.28,
        outcome: "loss",
      },
      {
        year: 2022,
        matchup: "stitched:2022:ultimate-last-place",
        side: 2,
        manager: "Dan",
        points: 102.58,
        outcome: "win",
      },
    ]);
  });

  it("preserves Sleeper reserve-list appearances as IR", () => {
    const result = database
      .prepare(
        `SELECT COUNT(*) count
         FROM lineup_entries le
         JOIN matchup_teams mt ON mt.id=le.matchup_team_id
         JOIN matchups m ON m.id=mt.matchup_id
         JOIN seasons s ON s.id=m.season_id
         WHERE s.year >= 2021 AND le.classification='ir' AND le.slot='IR'`,
      )
      .get() as { count: number };
    expect(result.count).toBeGreaterThan(0);
  });

  it("classifies only meaningful Sleeper postseason paths as canonical games", () => {
    const rows = database
      .prepare(
        `SELECT s.year, m.phase, COUNT(*) games
         FROM matchups m JOIN seasons s ON s.id=m.season_id
         WHERE s.year BETWEEN 2023 AND 2025
           AND m.week > s.regular_season_end_week
           AND m.status IN ('final', 'corrected')
         GROUP BY s.year, m.phase ORDER BY s.year, m.phase`,
      )
      .all();
    expect(rows).toEqual(
      [2023, 2024, 2025].flatMap((year) => [
        { year, phase: "consolation", games: 1 },
        { year, phase: "losers", games: 3 },
        { year, phase: "placement", games: 8 },
        { year, phase: "winners", games: 7 },
      ]),
    );
  });

  it("contains no canonical ties", () => {
    expect(
      database
        .prepare(
          `SELECT COUNT(DISTINCT m.id) count
           FROM matchups m
           JOIN seasons s ON s.id=m.season_id
           JOIN matchup_teams mt ON mt.matchup_id=m.id
           WHERE s.status='complete' AND m.status IN ('final', 'corrected')
             AND mt.outcome='tie'`,
        )
        .get(),
    ).toEqual({ count: 0 });
  });
});
