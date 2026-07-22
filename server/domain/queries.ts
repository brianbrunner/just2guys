import { calculateStandings } from "./standings";
import { calculateManagerElo, ELO_INITIAL_RATING } from "./elo";
import { getSeasonManifest } from "../manifests/registry";
import { safeImageUrl } from "../security/image-url";
import { calculateRecord, recordDefinitions } from "./records";
import {
  loadDomainDataset,
  type DomainDataset,
  type DomainManager,
  type DomainSide,
} from "./dataset";

export async function getSeasonArchive(database: D1Database) {
  const result = await database
    .prepare(
      `SELECT s.id, s.year, s.slug, s.name, s.status, s.structure, s.team_count, s.visible,
              champion.name champion_name, last_place.name last_place_name
       FROM seasons s
       LEFT JOIN season_teams champion ON champion.season_id=s.id AND champion.final_place=1
       LEFT JOIN season_teams last_place ON last_place.season_id=s.id AND last_place.final_place=s.team_count
       WHERE s.visible=1 ORDER BY s.year DESC`,
    )
    .all<{
      id: string;
      year: number;
      slug: string;
      name: string;
      status: string;
      structure: string;
      team_count: number;
      visible: number;
      champion_name: string | null;
      last_place_name: string | null;
    }>();
  return result.results;
}

export async function getSeasonPage(
  database: D1Database,
  year: number,
  providedDataset?: DomainDataset,
) {
  const [dataset, seasonRow] = await Promise.all([
    providedDataset ??
      loadDomainDataset(database, {
        includeUnreviewed: true,
        includeLive: true,
        years: [year],
      }),
    database
      .prepare(
        `SELECT id, year, slug, name, status, structure, team_count, regular_season_start_week,
              regular_season_end_week, playoff_start_week, final_week, notes
       FROM seasons WHERE year=? AND visible=1`,
      )
      .bind(year)
      .first<{
        id: string;
        year: number;
        slug: string;
        name: string;
        status: string;
        structure: string;
        team_count: number;
        regular_season_start_week: number;
        regular_season_end_week: number;
        playoff_start_week: number | null;
        final_week: number;
        notes: string | null;
      }>(),
  ]);
  if (!seasonRow) return null;
  const seasonTeams = dataset.teams.filter((team) => team.year === year);
  const seasonSides = dataset.sides.filter((side) => side.year === year);
  const manifest = getSeasonManifest(year);
  const matchups = groupMatchups(seasonSides);
  const finalSideIds = new Set(
    seasonSides
      .filter((side) => side.status === "final" || side.status === "corrected")
      .map((side) => side.id),
  );
  const seasonDataset: DomainDataset = {
    seasons: dataset.seasons.filter((season) => season.year === year),
    teams: seasonTeams,
    sides: seasonSides.filter((side) => finalSideIds.has(side.id)),
    lineups: dataset.lineups.filter(
      (entry) => entry.year === year && finalSideIds.has(entry.matchupTeamId),
    ),
  };
  const awardSlugs = [
    "take-the-high-road",
    "take-the-low-road",
    "demolished",
    "put-me-in-coach",
  ];
  const [corrections, sourceResult] = await Promise.all([
    database
      .prepare(
        "SELECT reason, target_id, reviewed_at FROM corrections WHERE season_id=? ORDER BY reviewed_at",
      )
      .bind(seasonRow.id)
      .all<{ reason: string; target_id: string; reviewed_at: string }>(),
    database
      .prepare(
        "SELECT provider, external_id, role, group_label, enabled, ignored_reason FROM season_sources WHERE season_id=? ORDER BY priority DESC",
      )
      .bind(seasonRow.id)
      .all<{
        provider: string;
        external_id: string;
        role: string;
        group_label: string | null;
        enabled: number;
        ignored_reason: string | null;
      }>(),
  ]);
  return {
    season: seasonRow,
    teams: seasonTeams,
    standings: calculateStandings(
      seasonTeams,
      seasonSides,
      manifest?.standingsTiebreakers,
    ),
    standingsSource:
      seasonTeams.length > 0 &&
      seasonTeams.every((team) => team.playoffSeed !== null) &&
      new Set(seasonTeams.map((team) => team.playoffSeed)).size ===
        seasonTeams.length
        ? "official"
        : "reconstructed",
    standingsTiebreakers: manifest?.standingsTiebreakers ?? [
      "wins",
      "ties",
      "points_for",
      "display_name",
    ],
    matchups,
    sources: sourceResult.results,
    corrections: corrections.results,
    awards: awardSlugs.flatMap((slug) => {
      const definition = recordDefinitions.find(
        (record) => record.slug === slug,
      );
      const entry = calculateRecord(seasonDataset, slug)[0];
      return definition && entry ? [{ definition, entry }] : [];
    }),
    champion: seasonTeams.find((team) => team.finalPlace === 1) ?? null,
    lastPlace:
      seasonTeams.find((team) => team.finalPlace === team.teamCount) ?? null,
  };
}

export function groupMatchups(sides: DomainSide[]) {
  const groups = new Map<string, DomainSide[]>();
  for (const side of sides) {
    const group = groups.get(side.matchupId) ?? [];
    group.push(side);
    groups.set(side.matchupId, group);
  }
  return [...groups.entries()]
    .map(([id, matchupSides]) => ({
      id,
      year: matchupSides[0]?.year ?? 0,
      week: matchupSides[0]?.week ?? 0,
      phase: matchupSides[0]?.phase ?? "regular",
      placementLabel: matchupSides[0]?.placementLabel ?? null,
      status: matchupSides[0]?.status ?? "scheduled",
      sides: matchupSides.sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    }))
    .sort(
      (left, right) =>
        left.week - right.week || left.id.localeCompare(right.id),
    );
}

export async function getWeekPage(
  database: D1Database,
  year: number,
  week: number,
) {
  const season = await database
    .prepare(
      "SELECT id, name, status, final_week FROM seasons WHERE year=? AND visible=1",
    )
    .bind(year)
    .first<{
      id: string;
      name: string;
      status: string;
      final_week: number;
    }>();
  if (!season) return null;
  const dataset = await loadDomainDataset(database, {
    includeUnreviewed: true,
    includeLive: true,
    includeLineups: false,
    years: [year],
  });
  return {
    season: { ...season, year },
    week,
    matchups: groupMatchups(
      dataset.sides.filter((side) => side.year === year && side.week === week),
    ),
    freshness: await getFreshness(database),
  };
}

export async function getMatchupPage(database: D1Database, id: string) {
  const matchup = await database
    .prepare(
      `SELECT m.id, m.week, m.phase, m.placement_label, m.status, m.corrected, s.year, s.name season_name
       FROM matchups m JOIN seasons s ON s.id=m.season_id
       WHERE m.id=? AND m.phase <> 'placement'`,
    )
    .bind(id)
    .first<{
      id: string;
      week: number;
      phase: string;
      placement_label: string | null;
      status: string;
      corrected: number;
      year: number;
      season_name: string;
    }>();
  if (!matchup) return null;
  const sideRows = await database
    .prepare(
      `SELECT mt.id, mt.side, mt.points, mt.projected_points, mt.outcome, st.id team_id, st.name team_name,
              st.slug team_slug
       FROM matchup_teams mt JOIN season_teams st ON st.id=mt.season_team_id
       WHERE mt.matchup_id=? ORDER BY mt.side`,
    )
    .bind(id)
    .all<{
      id: string;
      side: number;
      points: number;
      projected_points: number | null;
      outcome: string;
      team_id: string;
      team_name: string;
      team_slug: string;
    }>();
  const managerRows = await database
    .prepare(
      `SELECT mt.id matchup_team_id, p.slug, p.preferred_name
       FROM matchup_teams mt JOIN season_team_managers stm ON stm.season_team_id=mt.season_team_id
       JOIN people p ON p.id=stm.person_id WHERE mt.matchup_id=?`,
    )
    .bind(id)
    .all<{ matchup_team_id: string; slug: string; preferred_name: string }>();
  const lineupRows = await database
    .prepare(
      `SELECT le.matchup_team_id, le.id, le.slot, le.classification, le.slot_order, le.points,
              le.projected_points, p.id player_id, p.name player_name, p.position, p.nfl_team, p.image_url
       FROM lineup_entries le JOIN players p ON p.id=le.player_id
       JOIN matchup_teams mt ON mt.id=le.matchup_team_id
       WHERE mt.matchup_id=?
       ORDER BY mt.side, CASE le.classification WHEN 'starter' THEN 0 WHEN 'bench' THEN 1 ELSE 2 END, le.slot_order`,
    )
    .bind(id)
    .all<{
      matchup_team_id: string;
      id: string;
      slot: string;
      classification: string;
      slot_order: number;
      points: number;
      projected_points: number | null;
      player_id: string;
      player_name: string;
      position: string;
      nfl_team: string | null;
      image_url: string | null;
    }>();
  return {
    matchup,
    sides: sideRows.results.map((side) => ({
      ...side,
      managers: managerRows.results.filter(
        (manager) => manager.matchup_team_id === side.id,
      ),
      lineup: lineupRows.results.filter(
        (entry) => entry.matchup_team_id === side.id,
      ),
    })),
  };
}

export async function getManagersPage(
  database: D1Database,
  provided?: { dataset: DomainDataset; visibleDataset: DomainDataset },
) {
  const [dataset, visibleDataset] = provided
    ? [provided.dataset, provided.visibleDataset]
    : await Promise.all([
        loadDomainDataset(database, { includeLineups: false }),
        loadDomainDataset(database, {
          includeUnreviewed: true,
          includeLineups: false,
        }),
      ]);
  const eloRatings = calculateManagerElo(dataset.sides);
  const visibleSeasonStatus = new Map(
    visibleDataset.seasons.map((season) => [season.year, season.status]),
  );
  const managers = new Map<
    string,
    {
      manager: DomainManager;
      wins: number;
      losses: number;
      ties: number;
      points: number;
      seasons: Set<number>;
      championships: number;
      lastPlaces: number;
      recordedSeasons: Set<number>;
      reviewSeasons: Set<number>;
    }
  >();
  for (const team of visibleDataset.teams) {
    for (const manager of team.managers) {
      const item = managers.get(manager.id) ?? {
        manager,
        wins: 0,
        losses: 0,
        ties: 0,
        points: 0,
        seasons: new Set<number>(),
        championships: 0,
        lastPlaces: 0,
        recordedSeasons: new Set<number>(),
        reviewSeasons: new Set<number>(),
      };
      item.recordedSeasons.add(team.year);
      if (visibleSeasonStatus.get(team.year) === "needs_review")
        item.reviewSeasons.add(team.year);
      managers.set(manager.id, item);
    }
  }
  for (const side of dataset.sides) {
    for (const manager of side.managers) {
      const item = managers.get(manager.id) ?? {
        manager,
        wins: 0,
        losses: 0,
        ties: 0,
        points: 0,
        seasons: new Set<number>(),
        championships: 0,
        lastPlaces: 0,
        recordedSeasons: new Set<number>(),
        reviewSeasons: new Set<number>(),
      };
      if (side.outcome === "win") item.wins += 1;
      if (side.outcome === "loss") item.losses += 1;
      if (side.outcome === "tie") item.ties += 1;
      item.points += side.points;
      item.seasons.add(side.year);
      managers.set(manager.id, item);
    }
  }
  for (const team of dataset.teams) {
    for (const manager of team.managers) {
      const item = managers.get(manager.id);
      if (!item) continue;
      if (team.finalPlace === 1) item.championships += 1;
      if (team.finalPlace === team.teamCount) item.lastPlaces += 1;
    }
  }
  return [...managers.values()]
    .map((item) => ({
      id: item.manager.id,
      slug: item.manager.slug,
      name: item.manager.name,
      wins: item.wins,
      losses: item.losses,
      ties: item.ties,
      winPercentage:
        item.wins + item.losses + item.ties
          ? (item.wins + item.ties * 0.5) /
            (item.wins + item.losses + item.ties)
          : 0,
      points: Math.round(item.points * 100) / 100,
      seasons: item.seasons.size,
      recordedSeasons: item.recordedSeasons.size,
      reviewSeasons: [...item.reviewSeasons].sort(),
      championships: item.championships,
      lastPlaces: item.lastPlaces,
      elo: eloRatings.get(item.manager.id)?.current ?? ELO_INITIAL_RATING,
    }))
    .sort(
      (left, right) =>
        right.elo - left.elo ||
        right.wins - left.wins ||
        left.name.localeCompare(right.name),
    )
    .map((item, index) => ({ ...item, eloRank: index + 1 }));
}

export async function getManagerPage(database: D1Database, slug: string) {
  const [dataset, visibleDataset] = await Promise.all([
    loadDomainDataset(database),
    loadDomainDataset(database, {
      includeUnreviewed: true,
      includeLineups: false,
    }),
  ]);
  const managers = await getManagersPage(database, {
    dataset,
    visibleDataset,
  });
  const manager = managers.find((candidate) => candidate.slug === slug);
  if (!manager) return null;
  const elo = calculateManagerElo(dataset.sides).get(manager.id) ?? {
    current: ELO_INITIAL_RATING,
    peak: ELO_INITIAL_RATING,
    low: ELO_INITIAL_RATING,
    games: 0,
    history: [],
  };
  const visibleSeasonStatus = new Map(
    visibleDataset.seasons.map((season) => [season.year, season.status]),
  );
  const teams = dataset.teams.filter((team) =>
    team.managers.some((candidate) => candidate.id === manager.id),
  );
  const historyTeams = visibleDataset.teams
    .filter((team) =>
      team.managers.some((candidate) => candidate.id === manager.id),
    )
    .map((team) => ({
      ...team,
      underReview: visibleSeasonStatus.get(team.year) === "needs_review",
    }));
  const sides = dataset.sides.filter((side) =>
    side.managers.some((candidate) => candidate.id === manager.id),
  );
  const opponents = new Map<
    string,
    {
      manager: DomainManager;
      wins: number;
      losses: number;
      ties: number;
      games: number;
      pointsFor: number;
      pointsAgainst: number;
      closestMargin: number;
    }
  >();
  for (const matchup of groupMatchups(dataset.sides)) {
    const ownSide = matchup.sides.find((side) =>
      side.managers.some((candidate) => candidate.id === manager.id),
    );
    const otherSide = matchup.sides.find((side) => side !== ownSide);
    if (!ownSide || !otherSide) continue;
    for (const opponent of otherSide.managers) {
      const item = opponents.get(opponent.id) ?? {
        manager: opponent,
        wins: 0,
        losses: 0,
        ties: 0,
        games: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        closestMargin: Number.POSITIVE_INFINITY,
      };
      item.games += 1;
      item.pointsFor += ownSide.points;
      item.pointsAgainst += otherSide.points;
      item.closestMargin = Math.min(
        item.closestMargin,
        Math.abs(ownSide.points - otherSide.points),
      );
      if (ownSide.outcome === "win") item.wins += 1;
      if (ownSide.outcome === "loss") item.losses += 1;
      if (ownSide.outcome === "tie") item.ties += 1;
      opponents.set(opponent.id, item);
    }
  }
  const favoritePlayers = new Map<
    string,
    { id: string; name: string; starts: number }
  >();
  for (const entry of dataset.lineups.filter(
    (candidate) =>
      candidate.classification === "starter" &&
      candidate.managers.some((person) => person.id === manager.id),
  )) {
    const item = favoritePlayers.get(entry.playerId) ?? {
      id: entry.playerId,
      name: entry.playerName,
      starts: 0,
    };
    item.starts += 1;
    favoritePlayers.set(entry.playerId, item);
  }
  const aliases = await database
    .prepare(
      `SELECT provider, display_name, external_id FROM provider_accounts
       WHERE person_id=? ORDER BY provider, display_name`,
    )
    .bind(manager.id)
    .all<{ provider: string; display_name: string; external_id: string }>();
  const identity = await database
    .prepare("SELECT aliases_json FROM people WHERE id=?")
    .bind(manager.id)
    .first<{ aliases_json: string }>();
  let identityAliases: string[] = [];
  try {
    const parsed: unknown = JSON.parse(identity?.aliases_json ?? "[]");
    if (Array.isArray(parsed))
      identityAliases = parsed.filter(
        (value): value is string => typeof value === "string",
      );
  } catch {
    identityAliases = [];
  }
  const displayedNames = new Set(
    [manager.name, ...aliases.results.map((alias) => alias.display_name)].map(
      (value) => value.toLocaleLowerCase(),
    ),
  );
  const knownAliases = [...new Set(identityAliases)].filter(
    (value) => !displayedNames.has(value.toLocaleLowerCase()),
  );
  const rivalRows = [...opponents.values()].map((rival) => ({
    ...rival,
    winPercentage: rival.games
      ? (rival.wins + rival.ties * 0.5) / rival.games
      : 0,
    pointsFor: Math.round(rival.pointsFor * 100) / 100,
    pointsAgainst: Math.round(rival.pointsAgainst * 100) / 100,
    closestMargin: Math.round(rival.closestMargin * 100) / 100,
  }));
  const eligibleRivals = rivalRows.filter((rival) => rival.games >= 3);
  const closestRival =
    [...(eligibleRivals.length ? eligibleRivals : rivalRows)].sort(
      (left, right) =>
        Math.abs(left.winPercentage - 0.5) -
          Math.abs(right.winPercentage - 0.5) ||
        right.games - left.games ||
        left.manager.name.localeCompare(right.manager.name),
    )[0] ?? null;
  const nemesis =
    [...(eligibleRivals.length ? eligibleRivals : rivalRows)].sort(
      (left, right) =>
        right.losses - left.losses ||
        left.winPercentage - right.winPercentage ||
        right.games - left.games,
    )[0] ?? null;
  const playoffSeasons = new Set(
    sides.filter((side) => side.phase === "winners").map((side) => side.year),
  );
  const regularTeamStats = new Map<string, { wins: number; points: number }>();
  for (const side of sides.filter(
    (candidate) => candidate.phase === "regular",
  )) {
    const row = regularTeamStats.get(side.teamId) ?? { wins: 0, points: 0 };
    if (side.outcome === "win") row.wins += 1;
    row.points += side.points;
    regularTeamStats.set(side.teamId, row);
  }
  const bestRegularSeason =
    teams
      .map((team) => ({
        team,
        ...(regularTeamStats.get(team.id) ?? { wins: 0, points: 0 }),
      }))
      .sort(
        (left, right) =>
          right.wins - left.wins ||
          right.points - left.points ||
          right.team.year - left.team.year,
      )[0] ?? null;
  const finalFinishes = teams.filter(
    (team): team is typeof team & { finalPlace: number } =>
      team.finalPlace !== null,
  );
  const bestFinish =
    finalFinishes.sort(
      (left, right) =>
        left.finalPlace - right.finalPlace || right.year - left.year,
    )[0] ?? null;
  const managerHref = `/managers/${manager.slug}`;
  const notableRecords = recordDefinitions.flatMap((definition) => {
    const entry = calculateRecord(dataset, definition.slug).find(
      (candidate) =>
        candidate.href === managerHref ||
        candidate.secondaryHref === managerHref,
    );
    return entry ? [{ definition, entry }] : [];
  });
  return {
    manager,
    aliases: aliases.results,
    knownAliases,
    playoffAppearances: playoffSeasons.size,
    bestFinish,
    bestRegularSeason,
    closestRival,
    nemesis,
    notableRecords,
    elo,
    teams: historyTeams.sort((left, right) => right.year - left.year),
    games: groupMatchups(sides).sort(
      (left, right) => right.year - left.year || right.week - left.week,
    ),
    rivals: rivalRows.sort((left, right) => right.games - left.games),
    favoritePlayers: [...favoritePlayers.values()]
      .sort((left, right) => right.starts - left.starts)
      .slice(0, 10),
  };
}

export async function getRivalryPage(
  database: D1Database,
  slugA: string,
  slugB: string,
) {
  const dataset = await loadDomainDataset(database, { includeLineups: false });
  const managers = new Map(
    dataset.teams
      .flatMap((team) => team.managers)
      .map((manager) => [manager.slug, manager]),
  );
  const managerA = managers.get(slugA);
  const managerB = managers.get(slugB);
  if (!managerA || !managerB || managerA.id === managerB.id) return null;
  const games = groupMatchups(dataset.sides).filter(
    (matchup) =>
      matchup.sides.some((side) =>
        side.managers.some((manager) => manager.id === managerA.id),
      ) &&
      matchup.sides.some((side) =>
        side.managers.some((manager) => manager.id === managerB.id),
      ),
  );
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  const margins: { matchupId: string; margin: number; won: boolean }[] = [];
  for (const game of games) {
    const own = game.sides.find((side) =>
      side.managers.some((manager) => manager.id === managerA.id),
    );
    const other = game.sides.find((side) =>
      side.managers.some((manager) => manager.id === managerB.id),
    );
    if (!own || !other) continue;
    pointsFor += own.points;
    pointsAgainst += other.points;
    if (own.outcome === "win") wins += 1;
    if (own.outcome === "loss") losses += 1;
    if (own.outcome === "tie") ties += 1;
    margins.push({
      matchupId: game.id,
      margin: Math.abs(own.points - other.points),
      won: own.outcome === "win",
    });
  }
  const chronological = [...games].sort(
    (left, right) => left.year - right.year || left.week - right.week,
  );
  let streak = 0;
  let streakOwner = "Tie";
  for (const game of [...chronological].reverse()) {
    const own = game.sides.find((side) =>
      side.managers.some((manager) => manager.id === managerA.id),
    );
    if (!own || own.outcome === "tie") break;
    const owner = own.outcome === "win" ? managerA.name : managerB.name;
    if (streakOwner !== "Tie" && streakOwner !== owner) break;
    streakOwner = owner;
    streak += 1;
  }
  return {
    managerA,
    managerB,
    wins,
    losses,
    ties,
    totalGames: games.length,
    winPercentage: games.length ? (wins + ties * 0.5) / games.length : 0,
    pointsFor: Math.round(pointsFor * 100) / 100,
    pointsAgainst: Math.round(pointsAgainst * 100) / 100,
    postseasonMeetings: games.filter((game) => game.phase !== "regular").length,
    streak: { owner: streakOwner, games: streak },
    largestVictory:
      margins
        .filter((margin) => margin.won)
        .sort((left, right) => right.margin - left.margin)[0] ?? null,
    smallestVictory:
      margins
        .filter((margin) => margin.won)
        .sort((left, right) => left.margin - right.margin)[0] ?? null,
    largestDefeat:
      margins
        .filter((margin) => !margin.won)
        .sort((left, right) => right.margin - left.margin)[0] ?? null,
    smallestDefeat:
      margins
        .filter((margin) => !margin.won)
        .sort((left, right) => left.margin - right.margin)[0] ?? null,
    games: chronological,
  };
}

export async function getPlayerPage(database: D1Database, id: string) {
  const player = await database
    .prepare(
      "SELECT id, name, position, nfl_team, image_url, active FROM players WHERE id=?",
    )
    .bind(id)
    .first<{
      id: string;
      name: string;
      position: string;
      nfl_team: string | null;
      image_url: string | null;
      active: number;
    }>();
  if (!player) return null;
  const appearances = await database
    .prepare(
      `SELECT le.classification, le.points, le.slot, m.week, s.year, st.name team_name,
              p.slug manager_slug, p.preferred_name manager_name, m.id matchup_id
       FROM lineup_entries le
       JOIN matchup_teams mt ON mt.id=le.matchup_team_id
       JOIN matchups m ON m.id=mt.matchup_id
       JOIN seasons s ON s.id=m.season_id
       JOIN season_teams st ON st.id=mt.season_team_id
       JOIN season_team_managers stm ON stm.season_team_id=st.id
       JOIN people p ON p.id=stm.person_id
       WHERE le.player_id=? AND s.visible=1 AND s.status='complete'
         AND m.phase <> 'placement'
       ORDER BY s.year DESC, m.week DESC`,
    )
    .bind(id)
    .all<{
      classification: string;
      points: number;
      slot: string;
      week: number;
      year: number;
      team_name: string;
      manager_slug: string;
      manager_name: string;
      matchup_id: string;
    }>();
  const starts = appearances.results.filter(
    (entry) => entry.classification === "starter",
  );
  const bench = appearances.results.filter(
    (entry) => entry.classification === "bench",
  );
  const history = new Map<
    string,
    {
      year: number;
      teamName: string;
      managerName: string;
      managerSlug: string;
      starts: number;
      bench: number;
      points: number;
    }
  >();
  for (const entry of appearances.results) {
    const key = `${entry.year}:${entry.team_name}:${entry.manager_slug}`;
    const row = history.get(key) ?? {
      year: entry.year,
      teamName: entry.team_name,
      managerName: entry.manager_name,
      managerSlug: entry.manager_slug,
      starts: 0,
      bench: 0,
      points: 0,
    };
    if (entry.classification === "starter") row.starts += 1;
    if (entry.classification === "bench") row.bench += 1;
    row.points += entry.points;
    history.set(key, row);
  }
  const dataset = await loadDomainDataset(database);
  const playerHref = `/players/${id}`;
  const recordAppearances = recordDefinitions.flatMap((definition) => {
    const entry = calculateRecord(dataset, definition.slug).find(
      (candidate) =>
        candidate.href === playerHref || candidate.secondaryHref === playerHref,
    );
    return entry ? [{ definition, entry }] : [];
  });
  return {
    player: { ...player, image_url: safeImageUrl(player.image_url) },
    starts: starts.length,
    benchAppearances: bench.length,
    starterPoints:
      Math.round(
        starts.reduce((total, entry) => total + entry.points, 0) * 100,
      ) / 100,
    best:
      [...appearances.results].sort(
        (left, right) => right.points - left.points,
      )[0] ?? null,
    worstStart:
      [...starts].sort((left, right) => left.points - right.points)[0] ?? null,
    appearances: appearances.results,
    history: [...history.values()].sort(
      (left, right) => right.year - left.year || right.starts - left.starts,
    ),
    recordAppearances,
  };
}

export async function getFreshness(database: D1Database) {
  const [row, recent] = await Promise.all([
    database
      .prepare(
        `SELECT finished_at, status FROM sync_runs
         WHERE status IN ('success', 'partial') ORDER BY finished_at DESC LIMIT 1`,
      )
      .first<{ finished_at: string; status: string }>(),
    database
      .prepare(
        `SELECT status, finished_at, error_summary FROM sync_runs
         WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 10`,
      )
      .all<{
        status: string;
        finished_at: string;
        error_summary: string | null;
      }>(),
  ]);
  if (!row) return null;
  let consecutiveFailures = 0;
  for (const run of recent.results) {
    if (run.status !== "failed") break;
    consecutiveFailures += 1;
  }
  return {
    ...row,
    consecutiveFailures,
    lastFailure: recent.results.find((run) => run.status === "failed") ?? null,
  };
}

export async function getHomePage(database: D1Database, activeYear: number) {
  const [archive, freshness] = await Promise.all([
    getSeasonArchive(database),
    getFreshness(database),
  ]);
  const fallbackYear = archive.find(
    (season) => season.status === "complete",
  )?.year;
  const featuredYears = [activeYear, fallbackYear].filter(
    (year): year is number => year !== undefined,
  );
  const [dataset, visibleDataset, liveDataset] = await Promise.all([
    loadDomainDataset(database, { includeLineups: false }),
    loadDomainDataset(database, {
      includeUnreviewed: true,
      includeLineups: false,
    }),
    loadDomainDataset(database, {
      includeUnreviewed: true,
      includeLive: true,
      years: featuredYears,
    }),
  ]);
  const [managers, active, fallback] = await Promise.all([
    getManagersPage(database, { dataset, visibleDataset }),
    getSeasonPage(database, activeYear, liveDataset),
    fallbackYear && fallbackYear !== activeYear
      ? getSeasonPage(database, fallbackYear, liveDataset)
      : Promise.resolve(null),
  ]);
  const featured = active?.matchups.length || !fallbackYear ? active : fallback;
  const latestWeek =
    featured?.matchups.reduce(
      (maximum, matchup) => Math.max(maximum, matchup.week),
      0,
    ) ?? 0;
  return {
    active,
    featured,
    seasonCount: archive.length,
    managerCount: managers.length,
    latestWeek,
    latestMatchups:
      featured?.matchups.filter((matchup) => matchup.week === latestWeek) ?? [],
    lastCompleted:
      archive.find((season) => season.status === "complete") ?? null,
    notablePerformances: featured?.awards.slice(0, 4) ?? [],
    archive: archive.slice(0, 6),
    leaders: managers.slice(0, 8),
    freshness,
  };
}
