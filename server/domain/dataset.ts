export interface DomainSeason {
  id: string;
  year: number;
  name: string;
  status: string;
  teamCount: number;
  regularSeasonEndWeek: number;
}

export interface DomainManager {
  id: string;
  slug: string;
  name: string;
}

export interface DomainTeam {
  id: string;
  slug: string;
  name: string;
  seasonId: string;
  year: number;
  teamCount: number;
  groupLabel: string | null;
  playoffSeed: number | null;
  finalPlace: number | null;
  managers: DomainManager[];
}

export interface DomainSide {
  id: string;
  matchupId: string;
  seasonId: string;
  year: number;
  week: number;
  phase: string;
  placementLabel?: string | null;
  status: string;
  teamId: string;
  teamName: string;
  teamSlug: string;
  points: number;
  outcome: string;
  managers: DomainManager[];
}

export interface DomainLineupEntry {
  id: string;
  matchupTeamId: string;
  year: number;
  week: number;
  phase: string;
  teamId: string;
  teamName: string;
  playerId: string;
  playerName: string;
  playerPosition: string;
  classification: string;
  points: number;
  managers: DomainManager[];
}

export interface DomainDataset {
  seasons: DomainSeason[];
  teams: DomainTeam[];
  sides: DomainSide[];
  lineups: DomainLineupEntry[];
}

interface TeamRow {
  id: string;
  slug: string;
  name: string;
  season_id: string;
  year: number;
  team_count: number;
  group_label: string | null;
  playoff_seed: number | null;
  final_place: number | null;
}

interface ManagerRow {
  season_team_id: string;
  id: string;
  slug: string;
  preferred_name: string;
}

function allForYears<T>(database: D1Database, query: string, years: number[]) {
  const statement = database.prepare(query);
  return (years.length > 0 ? statement.bind(...years) : statement).all<T>();
}

export async function loadDomainDataset(
  database: D1Database,
  options: {
    includeUnreviewed?: boolean;
    includeLive?: boolean;
    includeLineups?: boolean;
    years?: number[];
  } = {},
): Promise<DomainDataset> {
  const seasonFilter = options.includeUnreviewed
    ? "s.visible = 1"
    : "s.visible = 1 AND s.status = 'complete'";
  const matchupFilter = options.includeLive
    ? "m.status <> 'cancelled'"
    : "m.status IN ('final', 'corrected')";
  const meaningfulMatchupFilter = "m.phase <> 'placement'";
  const years = [
    ...new Set(
      (options.years ?? []).filter(
        (year) => Number.isInteger(year) && year > 0,
      ),
    ),
  ];
  const yearFilter = years.length
    ? ` AND s.year IN (${years.map(() => "?").join(", ")})`
    : "";
  const [seasonResult, teamResult, managerResult, sideResult, lineupResult] =
    await Promise.all([
      allForYears<{
        id: string;
        year: number;
        name: string;
        status: string;
        team_count: number;
        regular_season_end_week: number;
      }>(
        database,
        `SELECT id, year, name, status, team_count, regular_season_end_week
         FROM seasons s WHERE ${seasonFilter}${yearFilter} ORDER BY year`,
        years,
      ),
      allForYears<TeamRow>(
        database,
        `SELECT st.id, st.slug, st.name, st.season_id, s.year, s.team_count,
                  st.group_label, st.playoff_seed, st.final_place
         FROM season_teams st JOIN seasons s ON s.id = st.season_id
         WHERE ${seasonFilter}${yearFilter}`,
        years,
      ),
      database
        .prepare(
          `SELECT stm.season_team_id, p.id, p.slug, p.preferred_name
         FROM season_team_managers stm JOIN people p ON p.id = stm.person_id`,
        )
        .all<ManagerRow>(),
      allForYears<{
        id: string;
        matchup_id: string;
        season_id: string;
        year: number;
        week: number;
        phase: string;
        placement_label: string | null;
        status: string;
        team_id: string;
        team_name: string;
        team_slug: string;
        points: number;
        outcome: string;
      }>(
        database,
        `SELECT mt.id, mt.matchup_id, m.season_id, s.year, m.week, m.phase, m.placement_label, m.status,
                mt.season_team_id team_id, st.name team_name, st.slug team_slug, mt.points, mt.outcome
         FROM matchup_teams mt
         JOIN matchups m ON m.id = mt.matchup_id
         JOIN seasons s ON s.id = m.season_id
         JOIN season_teams st ON st.id = mt.season_team_id
         WHERE ${seasonFilter} AND ${matchupFilter} AND ${meaningfulMatchupFilter}${yearFilter}`,
        years,
      ),
      options.includeLineups === false
        ? Promise.resolve({
            results: [] as Array<{
              id: string;
              matchup_team_id: string;
              year: number;
              week: number;
              phase: string;
              team_id: string;
              team_name: string;
              player_id: string;
              player_name: string;
              player_position: string;
              classification: string;
              points: number;
            }>,
          })
        : allForYears<{
            id: string;
            matchup_team_id: string;
            year: number;
            week: number;
            phase: string;
            placement_label: string | null;
            team_id: string;
            team_name: string;
            player_id: string;
            player_name: string;
            player_position: string;
            classification: string;
            points: number;
          }>(
            database,
            `SELECT le.id, le.matchup_team_id, s.year, m.week, m.phase, mt.season_team_id team_id,
                st.name team_name, le.player_id, p.name player_name, p.position player_position,
                le.classification, le.points
         FROM lineup_entries le
         JOIN matchup_teams mt ON mt.id = le.matchup_team_id
         JOIN matchups m ON m.id = mt.matchup_id
         JOIN seasons s ON s.id = m.season_id
         JOIN season_teams st ON st.id = mt.season_team_id
         JOIN players p ON p.id = le.player_id
         WHERE ${seasonFilter} AND ${matchupFilter} AND ${meaningfulMatchupFilter}${yearFilter}`,
            years,
          ),
    ]);
  const managersByTeam = new Map<string, DomainManager[]>();
  for (const row of managerResult.results) {
    const managers = managersByTeam.get(row.season_team_id) ?? [];
    managers.push({ id: row.id, slug: row.slug, name: row.preferred_name });
    managersByTeam.set(row.season_team_id, managers);
  }
  return {
    seasons: seasonResult.results.map((row) => ({
      id: row.id,
      year: row.year,
      name: row.name,
      status: row.status,
      teamCount: row.team_count,
      regularSeasonEndWeek: row.regular_season_end_week,
    })),
    teams: teamResult.results.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      seasonId: row.season_id,
      year: row.year,
      teamCount: row.team_count,
      groupLabel: row.group_label,
      playoffSeed: row.playoff_seed,
      finalPlace: row.final_place,
      managers: managersByTeam.get(row.id) ?? [],
    })),
    sides: sideResult.results.map((row) => ({
      id: row.id,
      matchupId: row.matchup_id,
      seasonId: row.season_id,
      year: row.year,
      week: row.week,
      phase: row.phase,
      placementLabel: row.placement_label,
      status: row.status,
      teamId: row.team_id,
      teamName: row.team_name,
      teamSlug: row.team_slug,
      points: row.points,
      outcome: row.outcome,
      managers: managersByTeam.get(row.team_id) ?? [],
    })),
    lineups: lineupResult.results.map((row) => ({
      id: row.id,
      matchupTeamId: row.matchup_team_id,
      year: row.year,
      week: row.week,
      phase: row.phase,
      teamId: row.team_id,
      teamName: row.team_name,
      playerId: row.player_id,
      playerName: row.player_name,
      playerPosition: row.player_position,
      classification: row.classification,
      points: row.points,
      managers: managersByTeam.get(row.team_id) ?? [],
    })),
  };
}
