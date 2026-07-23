import { calculateAllPlayStandings } from "./all-play";
import { loadDomainDataset } from "./dataset";
import { calculateStandings } from "./standings";
import { getSeasonManifest } from "../manifests/registry";
import { safeImageUrl } from "../security/image-url";

const timelineStories = new Map<number, string>([
  [2013, "The league begins on Yahoo with 14 teams."],
  [2014, "The field expands to 16 teams."],
  [2015, "The league returns to a 14-team format."],
  [2016, "The league embraces the 69 era."],
  [2017, "Sixteen teams return for another oversized season."],
  [2018, "The Field of Memes closes out the single-league Yahoo era."],
  [
    2019,
    "The first two-conference season splits the field into Groups A and B.",
  ],
  [2020, "La Liga and Bundesliga continue the two-conference experiment."],
  [
    2021,
    "The league moves to Sleeper. Evens and Odds play separately before repair leagues supply the Week 17 title games.",
  ],
  [
    2022,
    "Whiskeys and Tequilas play through Week 16, then meet for the overall championship and last-place games.",
  ],
  [2023, "The conferences reunite as one 14-team league."],
  [2024, "The modern single-league Sleeper format continues."],
  [2025, "Fourteen teams complete the latest chapter of the archive."],
  [2026, "The next 14-team season is waiting for draft night."],
]);

export async function getHistoryTimeline(database: D1Database) {
  const [seasons, sources] = await Promise.all([
    database
      .prepare(
        `SELECT s.id, s.year, s.name, s.status, s.structure, s.team_count, s.notes,
                champion.name champion_name, champion_person.preferred_name champion_manager,
                last_team.name last_place_name, last_person.preferred_name last_place_manager
         FROM seasons s
         LEFT JOIN season_teams champion
           ON champion.season_id=s.id AND champion.final_place=1
         LEFT JOIN season_team_managers champion_stm
           ON champion_stm.season_team_id=champion.id AND champion_stm.role='manager'
         LEFT JOIN people champion_person ON champion_person.id=champion_stm.person_id
         LEFT JOIN season_teams last_team
           ON last_team.season_id=s.id AND last_team.final_place=s.team_count
         LEFT JOIN season_team_managers last_stm
           ON last_stm.season_team_id=last_team.id AND last_stm.role='manager'
         LEFT JOIN people last_person ON last_person.id=last_stm.person_id
         WHERE s.visible=1 ORDER BY s.year`,
      )
      .all<{
        id: string;
        year: number;
        name: string;
        status: string;
        structure: string;
        team_count: number;
        notes: string | null;
        champion_name: string | null;
        champion_manager: string | null;
        last_place_name: string | null;
        last_place_manager: string | null;
      }>(),
    database
      .prepare(
        `SELECT ss.season_id, ss.provider, ss.group_label, ss.role
         FROM season_sources ss JOIN seasons s ON s.id=ss.season_id
         WHERE s.visible=1 AND ss.enabled=1
         ORDER BY s.year, ss.priority DESC, ss.external_id`,
      )
      .all<{
        season_id: string;
        provider: string;
        group_label: string | null;
        role: string;
      }>(),
  ]);
  return seasons.results.map((season) => ({
    ...season,
    story:
      timelineStories.get(season.year) ??
      `${season.team_count} teams played the ${season.name} season.`,
    sources: sources.results.filter((source) => source.season_id === season.id),
  }));
}

export async function getAllPlayHistory(
  database: D1Database,
  requestedYear?: number,
) {
  const seasonRows = await database
    .prepare(
      `SELECT year, name FROM seasons
       WHERE visible=1 AND status='complete' ORDER BY year DESC`,
    )
    .all<{ year: number; name: string }>();
  const selectedYear = seasonRows.results.some(
    (season) => season.year === requestedYear,
  )
    ? requestedYear
    : seasonRows.results[0]?.year;
  if (!selectedYear)
    return { seasons: seasonRows.results, selectedYear: null, rows: [] };
  const dataset = await loadDomainDataset(database, {
    years: [selectedYear],
    includeLineups: false,
  });
  const manifest = getSeasonManifest(selectedYear);
  const actual = new Map(
    calculateStandings(
      dataset.teams,
      dataset.sides,
      manifest?.standingsTiebreakers,
    ).map((row) => [row.teamId, row]),
  );
  return {
    seasons: seasonRows.results,
    selectedYear,
    rows: calculateAllPlayStandings(dataset.teams, dataset.sides)
      .filter((row) => row.actualGames > 0)
      .map((row) => {
        const actualStanding = actual.get(row.teamId);
        const actualRank = actualStanding?.rank ?? 0;
        return {
          ...row,
          actualRank,
          rankDelta: actualRank ? row.rank - actualRank : 0,
        };
      }),
  };
}

export async function getDraftHistory(
  database: D1Database,
  requestedYear?: number,
) {
  const seasonRows = await database
    .prepare(
      `SELECT s.year, COUNT(DISTINCT d.id) drafts, COUNT(dp.id) picks
       FROM seasons s
       JOIN season_sources ss ON ss.season_id=s.id
       JOIN drafts d ON d.season_source_id=ss.id
       LEFT JOIN draft_picks dp ON dp.draft_id=d.id
       WHERE s.visible=1
       GROUP BY s.year ORDER BY s.year DESC`,
    )
    .all<{ year: number; drafts: number; picks: number }>();
  const eligibleSeasons = seasonRows.results.filter(
    (season) => season.picks > 0,
  );
  const selectedYear = eligibleSeasons.some(
    (season) => season.year === requestedYear,
  )
    ? requestedYear
    : eligibleSeasons[0]?.year;
  if (!selectedYear)
    return { seasons: eligibleSeasons, selectedYear: null, drafts: [] };
  const [draftRows, pickRows, managerRows] = await Promise.all([
    database
      .prepare(
        `SELECT d.id, d.external_id, d.status, d.type, d.rounds, d.teams,
                d.started_at, d.completed_at, ss.group_label, ss.external_id league_id
         FROM drafts d
         JOIN season_sources ss ON ss.id=d.season_source_id
         JOIN seasons s ON s.id=ss.season_id
         WHERE s.year=? AND s.visible=1
         ORDER BY COALESCE(ss.group_label, ''), d.started_at`,
      )
      .bind(selectedYear)
      .all<{
        id: string;
        external_id: string;
        status: string;
        type: string;
        rounds: number;
        teams: number;
        started_at: string | null;
        completed_at: string | null;
        group_label: string | null;
        league_id: string;
      }>(),
    database
      .prepare(
        `SELECT dp.id, dp.draft_id, dp.pick_number, dp.round, dp.draft_slot,
                dp.keeper, p.id player_id, p.name player_name, p.position,
                p.nfl_team, st.id team_id, st.name team_name
         FROM draft_picks dp
         JOIN drafts d ON d.id=dp.draft_id
         JOIN season_sources ss ON ss.id=d.season_source_id
         JOIN seasons s ON s.id=ss.season_id
         JOIN players p ON p.id=dp.player_id
         LEFT JOIN season_teams st ON st.id=dp.season_team_id
         WHERE s.year=? AND s.visible=1
         ORDER BY dp.draft_id, dp.pick_number`,
      )
      .bind(selectedYear)
      .all<{
        id: string;
        draft_id: string;
        pick_number: number;
        round: number;
        draft_slot: number;
        keeper: number;
        player_id: string;
        player_name: string;
        position: string;
        nfl_team: string | null;
        team_id: string | null;
        team_name: string | null;
      }>(),
    database
      .prepare(
        `SELECT st.id team_id, p.preferred_name
         FROM season_teams st
         JOIN seasons s ON s.id=st.season_id
         JOIN season_team_managers stm ON stm.season_team_id=st.id
         JOIN people p ON p.id=stm.person_id
         WHERE s.year=?
         ORDER BY stm.role, p.preferred_name`,
      )
      .bind(selectedYear)
      .all<{ team_id: string; preferred_name: string }>(),
  ]);
  return {
    seasons: eligibleSeasons,
    selectedYear,
    drafts: draftRows.results.map((draft) => ({
      ...draft,
      picks: pickRows.results
        .filter((pick) => pick.draft_id === draft.id)
        .map((pick) => ({
          ...pick,
          managerNames: managerRows.results
            .filter((manager) => manager.team_id === pick.team_id)
            .map((manager) => manager.preferred_name),
        })),
    })),
  };
}

const transactionTypes = new Set([
  "all",
  "trade",
  "waiver",
  "free_agent",
  "commissioner",
]);

export async function getTransactionHistory(
  database: D1Database,
  options: { year?: number; type?: string; page?: number },
) {
  const seasonRows = await database
    .prepare(
      `SELECT s.year, COUNT(*) transactions
       FROM seasons s
       JOIN season_sources ss ON ss.season_id=s.id
       JOIN league_transactions lt ON lt.season_source_id=ss.id
       WHERE s.visible=1 AND lt.status='complete'
       GROUP BY s.year ORDER BY s.year DESC`,
    )
    .all<{ year: number; transactions: number }>();
  const selectedYear = seasonRows.results.some(
    (season) => season.year === options.year,
  )
    ? options.year
    : seasonRows.results[0]?.year;
  const selectedType = transactionTypes.has(options.type ?? "")
    ? (options.type ?? "all")
    : "all";
  const selectedPage = Math.max(1, Math.floor(options.page ?? 1));
  const pageSize = 50;
  if (!selectedYear)
    return {
      seasons: seasonRows.results,
      selectedYear: null,
      selectedType,
      page: 1,
      pageCount: 0,
      total: 0,
      transactions: [],
    };
  const typeClause = selectedType === "all" ? "" : " AND lt.type=?";
  const bindings =
    selectedType === "all" ? [selectedYear] : [selectedYear, selectedType];
  const count = await database
    .prepare(
      `SELECT COUNT(*) count
       FROM league_transactions lt
       JOIN season_sources ss ON ss.id=lt.season_source_id
       JOIN seasons s ON s.id=ss.season_id
       WHERE s.year=? AND s.visible=1 AND lt.status='complete'${typeClause}`,
    )
    .bind(...bindings)
    .first<{ count: number }>();
  const total = count?.count ?? 0;
  const pageCount = Math.ceil(total / pageSize);
  const page = Math.min(selectedPage, Math.max(pageCount, 1));
  const transactionRows = await database
    .prepare(
      `SELECT lt.id, lt.type, lt.week, lt.created_at_provider,
              creator.preferred_name creator_name, ss.group_label
       FROM league_transactions lt
       JOIN season_sources ss ON ss.id=lt.season_source_id
       JOIN seasons s ON s.id=ss.season_id
       LEFT JOIN provider_accounts pa ON pa.id=lt.creator_provider_account_id
       LEFT JOIN people creator ON creator.id=pa.person_id
       WHERE s.year=? AND s.visible=1 AND lt.status='complete'${typeClause}
       ORDER BY lt.created_at_provider DESC, lt.id
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, pageSize, (page - 1) * pageSize)
    .all<{
      id: string;
      type: string;
      week: number;
      created_at_provider: string;
      creator_name: string | null;
      group_label: string | null;
    }>();
  const transactionIds = transactionRows.results.map(
    (transaction) => transaction.id,
  );
  const placeholders = transactionIds.map(() => "?").join(", ");
  const [itemRows, rosterRows] = transactionIds.length
    ? await Promise.all([
        database
          .prepare(
            `SELECT ti.transaction_id, ti.action, p.id player_id, p.name player_name,
                    p.position, p.nfl_team, st.name team_name
             FROM transaction_items ti
             JOIN players p ON p.id=ti.player_id
             LEFT JOIN season_teams st ON st.id=ti.season_team_id
             WHERE ti.transaction_id IN (${placeholders})
             ORDER BY ti.transaction_id, ti.action, p.name`,
          )
          .bind(...transactionIds)
          .all<{
            transaction_id: string;
            action: "add" | "drop";
            player_id: string;
            player_name: string;
            position: string;
            nfl_team: string | null;
            team_name: string | null;
          }>(),
        database
          .prepare(
            `SELECT tr.transaction_id, st.name team_name, p.preferred_name manager_name
             FROM transaction_rosters tr
             JOIN season_teams st ON st.id=tr.season_team_id
             LEFT JOIN season_team_managers stm ON stm.season_team_id=st.id
             LEFT JOIN people p ON p.id=stm.person_id
             WHERE tr.transaction_id IN (${placeholders})
             ORDER BY tr.transaction_id, st.name, stm.role`,
          )
          .bind(...transactionIds)
          .all<{
            transaction_id: string;
            team_name: string;
            manager_name: string | null;
          }>(),
      ])
    : [{ results: [] }, { results: [] }];
  return {
    seasons: seasonRows.results,
    selectedYear,
    selectedType,
    page,
    pageCount,
    total,
    transactions: transactionRows.results.map((transaction) => ({
      ...transaction,
      items: itemRows.results.filter(
        (item) => item.transaction_id === transaction.id,
      ),
      rosters: rosterRows.results.filter(
        (roster) => roster.transaction_id === transaction.id,
      ),
    })),
  };
}

export async function getTeamNameMuseum(database: D1Database) {
  const [teams, managers] = await Promise.all([
    database
      .prepare(
        `SELECT st.id, st.name, st.logo_url, st.group_label, s.year
         FROM season_teams st JOIN seasons s ON s.id=st.season_id
         WHERE s.visible=1
         ORDER BY s.year DESC, st.name`,
      )
      .all<{
        id: string;
        name: string;
        logo_url: string | null;
        group_label: string | null;
        year: number;
      }>(),
    database
      .prepare(
        `SELECT stm.season_team_id, p.id person_id, p.slug, p.preferred_name
         FROM season_team_managers stm
         JOIN people p ON p.id=stm.person_id
         ORDER BY stm.role, p.preferred_name`,
      )
      .all<{
        season_team_id: string;
        person_id: string;
        slug: string;
        preferred_name: string;
      }>(),
  ]);
  const people = new Map<
    string,
    {
      id: string;
      slug: string;
      name: string;
      teams: Array<{
        id: string;
        name: string;
        logoUrl: string | null;
        groupLabel: string | null;
        year: number;
      }>;
    }
  >();
  for (const manager of managers.results) {
    const team = teams.results.find(
      (candidate) => candidate.id === manager.season_team_id,
    );
    if (!team) continue;
    const person = people.get(manager.person_id) ?? {
      id: manager.person_id,
      slug: manager.slug,
      name: manager.preferred_name,
      teams: [],
    };
    person.teams.push({
      id: team.id,
      name: team.name,
      logoUrl: safeImageUrl(team.logo_url),
      groupLabel: team.group_label,
      year: team.year,
    });
    people.set(manager.person_id, person);
  }
  return [...people.values()]
    .map((person) => ({
      ...person,
      uniqueNames: new Set(
        person.teams.map((team) => team.name.toLocaleLowerCase()),
      ).size,
    }))
    .sort(
      (left, right) =>
        right.uniqueNames - left.uniqueNames ||
        right.teams.length - left.teams.length ||
        left.name.localeCompare(right.name),
    );
}
