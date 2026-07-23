import type { DomainDataset, DomainManager, DomainSide } from "./dataset";
import { calculateAllPlayStandings } from "./all-play";
import { calculateManagerElo, ELO_INITIAL_RATING } from "./elo";
import { calculateStandings } from "./standings";

export interface RecordDefinition {
  slug: string;
  name: string;
  description: string;
  eligibility: string;
  direction: "asc" | "desc";
  tieRanking: "competition";
  limit: number;
  supportsPhase: boolean;
}

export interface RecordEntry {
  rank: number;
  label: string;
  detail: string;
  value: number;
  valueLabel: string;
  href?: string;
  secondaryHref?: string;
  year?: number;
  phase?: string;
}

function defineRecord(
  definition: Omit<RecordDefinition, "tieRanking" | "limit" | "supportsPhase"> &
    Partial<Pick<RecordDefinition, "supportsPhase">>,
): RecordDefinition {
  return {
    tieRanking: "competition",
    limit: 50,
    supportsPhase: true,
    ...definition,
  };
}

export const recordDefinitions: RecordDefinition[] = [
  defineRecord({
    slug: "los-campeones",
    name: "Los Campeones",
    description: "Championships by manager.",
    eligibility: "Reviewed, complete seasons only.",
    direction: "desc",
    supportsPhase: false,
  }),
  defineRecord({
    slug: "soy-un-perdedor",
    name: "Soy Un Perdedor",
    description: "Last-place finishes by manager.",
    eligibility: "Reviewed, complete seasons only.",
    direction: "desc",
    supportsPhase: false,
  }),
  defineRecord({
    slug: "nice",
    name: "Nice",
    description: "Team scores from 69.00 through 69.99.",
    eligibility: "Only the manager of the qualifying team receives credit.",
    direction: "desc",
  }),
  defineRecord({
    slug: "bad-beats",
    name: "Bad Beats",
    description: "Smallest final margins of victory.",
    eligibility: "Final non-tied games only.",
    direction: "asc",
  }),
  defineRecord({
    slug: "most-wins",
    name: "Most Wins",
    description: "Total manager wins.",
    eligibility: "Final games; byes excluded.",
    direction: "desc",
  }),
  defineRecord({
    slug: "best-manager-record",
    name: "Best Manager Record",
    description: "Manager win percentage.",
    eligibility: "At least 20 decisions; ties count as half a win.",
    direction: "desc",
  }),
  defineRecord({
    slug: "favorite-players",
    name: "Favorite Players",
    description: "Most starts by manager/player pairing.",
    eligibility: "Starter-classified lineup appearances only.",
    direction: "desc",
  }),
  defineRecord({
    slug: "real-dedication",
    name: "Real Dedication",
    description: "Lowest starter points per game by manager/player pairing.",
    eligibility: "At least 10 starts.",
    direction: "asc",
  }),
  defineRecord({
    slug: "postseason-appearances",
    name: "Postseason Appearances",
    description: "Qualifying winners-bracket appearances.",
    eligibility: "One appearance per manager per season.",
    direction: "desc",
    supportsPhase: false,
  }),
  defineRecord({
    slug: "demolished",
    name: "Demolished",
    description: "Largest final margins of victory.",
    eligibility: "Final non-tied games only.",
    direction: "desc",
  }),
  defineRecord({
    slug: "put-me-in-coach",
    name: "Put Me In, Coach",
    description: "Highest-scoring non-QB bench performances.",
    eligibility: "Bench-classified, non-QB players.",
    direction: "desc",
  }),
  defineRecord({
    slug: "take-the-low-road",
    name: "Take The Low Road",
    description: "Lowest combined matchup scores.",
    eligibility: "Final two-team games only.",
    direction: "asc",
  }),
  defineRecord({
    slug: "take-the-high-road",
    name: "Take The High Road",
    description: "Highest combined matchup scores.",
    eligibility: "Final two-team games only.",
    direction: "desc",
  }),
  defineRecord({
    slug: "domination",
    name: "Domination",
    description: "Strongest manager head-to-head records.",
    eligibility: "At least three decisions against the opponent.",
    direction: "desc",
  }),
  defineRecord({
    slug: "best-regular-season",
    name: "Best Regular Season",
    description: "Most regular-season wins by a season team.",
    eligibility: "Regular-season games only.",
    direction: "desc",
    supportsPhase: false,
  }),
  defineRecord({
    slug: "getting-away-with-it",
    name: "Getting Away With It",
    description: "Lowest team scores that still won.",
    eligibility: "Final two-team wins only.",
    direction: "asc",
  }),
  defineRecord({
    slug: "cursed",
    name: "Cursed",
    description: "Highest team scores that still lost.",
    eligibility: "Final two-team losses only.",
    direction: "desc",
  }),
  defineRecord({
    slug: "heater",
    name: "Heater",
    description: "Longest manager winning streaks.",
    eligibility:
      "Final decisions in chronological order; streaks cross seasons.",
    direction: "desc",
    supportsPhase: false,
  }),
  defineRecord({
    slug: "the-darkness",
    name: "The Darkness",
    description: "Longest manager losing streaks.",
    eligibility:
      "Final decisions in chronological order; streaks cross seasons.",
    direction: "desc",
    supportsPhase: false,
  }),
  defineRecord({
    slug: "giant-killer",
    name: "Giant Killer",
    description: "Largest victories by a pregame Elo underdog.",
    eligibility: "Winner entered the game with a lower manager Elo.",
    direction: "desc",
  }),
  defineRecord({
    slug: "schedule-merchant",
    name: "Schedule Merchant",
    description: "Most wins gained from the weekly schedule.",
    eligibility:
      "Regular season; actual wins compared with all-play expected wins.",
    direction: "desc",
    supportsPhase: false,
  }),
  defineRecord({
    slug: "schedule-from-hell",
    name: "Schedule From Hell",
    description: "Most wins lost to the weekly schedule.",
    eligibility:
      "Regular season; actual wins compared with all-play expected wins.",
    direction: "asc",
    supportsPhase: false,
  }),
  defineRecord({
    slug: "playoff-mode",
    name: "Playoff Mode",
    description: "Largest scoring jump from regular season to postseason.",
    eligibility: "At least two meaningful postseason games.",
    direction: "desc",
    supportsPhase: false,
  }),
  defineRecord({
    slug: "cinderella-run",
    name: "Cinderella Run",
    description: "Lowest regular-season seed to win the championship.",
    eligibility:
      "Reviewed champions with a reconstructable regular-season seed.",
    direction: "desc",
    supportsPhase: false,
  }),
  defineRecord({
    slug: "roller-coaster",
    name: "Roller Coaster",
    description: "Most volatile regular-season scoring.",
    eligibility: "At least 10 games; ranked by score standard deviation.",
    direction: "desc",
    supportsPhase: false,
  }),
];

export type RecordPhase =
  "regular" | "postseason" | "winners" | "consolation" | "losers" | "placement";

export interface RecordFilters {
  fromYear?: number;
  toYear?: number;
  phase?: RecordPhase;
}

export function filterRecordDataset(
  dataset: DomainDataset,
  filters: RecordFilters,
): DomainDataset {
  const inYearRange = (year: number) =>
    (filters.fromYear === undefined || year >= filters.fromYear) &&
    (filters.toYear === undefined || year <= filters.toYear);
  const inPhase = (phase: string) =>
    !filters.phase ||
    (filters.phase === "postseason"
      ? phase !== "regular"
      : phase === filters.phase);
  return {
    seasons: dataset.seasons.filter((season) => inYearRange(season.year)),
    teams: dataset.teams.filter((team) => inYearRange(team.year)),
    sides: dataset.sides.filter(
      (side) => inYearRange(side.year) && inPhase(side.phase),
    ),
    lineups: dataset.lineups.filter(
      (entry) => inYearRange(entry.year) && inPhase(entry.phase),
    ),
  };
}

function withRanks(
  entries: Omit<RecordEntry, "rank">[],
  direction: "asc" | "desc",
  limit = 50,
) {
  const sorted = [...entries].sort((left, right) =>
    direction === "asc" ? left.value - right.value : right.value - left.value,
  );
  let previous: number | undefined;
  let rank = 0;
  return sorted.slice(0, limit).map((entry, index) => {
    if (entry.value !== previous) rank = index + 1;
    previous = entry.value;
    return { rank, ...entry };
  });
}

function matchupPairs(sides: DomainSide[]) {
  const groups = new Map<string, DomainSide[]>();
  for (const side of sides) {
    const group = groups.get(side.matchupId) ?? [];
    group.push(side);
    groups.set(side.matchupId, group);
  }
  return [...groups.values()].filter(
    (group): group is [DomainSide, DomainSide] => group.length === 2,
  );
}

function managerHref(manager: DomainManager) {
  return `/managers/${manager.slug}`;
}

function gameLabel(pair: [DomainSide, DomainSide]) {
  return `${pair[0].teamName} vs ${pair[1].teamName}`;
}

function gameDetail(pair: [DomainSide, DomainSide]) {
  return `${pair[0].year} · Week ${pair[0].week}`;
}

export function calculateRecord(
  dataset: DomainDataset,
  slug: string,
): RecordEntry[] {
  const definition = recordDefinitions.find(
    (candidate) => candidate.slug === slug,
  );
  if (!definition) return [];
  const pairs = matchupPairs(dataset.sides);
  if (slug === "los-campeones" || slug === "soy-un-perdedor") {
    const targetPlace = slug === "los-campeones" ? 1 : "last";
    const totals = new Map<
      string,
      { manager: DomainManager; years: number[] }
    >();
    for (const team of dataset.teams) {
      const qualifies =
        targetPlace === 1
          ? team.finalPlace === 1
          : team.finalPlace === team.teamCount;
      if (!qualifies) continue;
      for (const manager of team.managers) {
        const item = totals.get(manager.id) ?? { manager, years: [] };
        item.years.push(team.year);
        totals.set(manager.id, item);
      }
    }
    return withRanks(
      [...totals.values()].map(({ manager, years }) => ({
        label: manager.name,
        detail: years.sort().join(", "),
        value: years.length,
        valueLabel: String(years.length),
        href: managerHref(manager),
      })),
      definition.direction,
    );
  }
  if (slug === "nice") {
    const totals = new Map<string, { manager: DomainManager; count: number }>();
    for (const side of dataset.sides.filter(
      (candidate) => candidate.points >= 69 && candidate.points < 70,
    )) {
      for (const manager of side.managers) {
        const item = totals.get(manager.id) ?? { manager, count: 0 };
        item.count += 1;
        totals.set(manager.id, item);
      }
    }
    return withRanks(
      [...totals.values()].map(({ manager, count }) => ({
        label: manager.name,
        detail: "Qualifying scores",
        value: count,
        valueLabel: String(count),
        href: managerHref(manager),
      })),
      "desc",
    );
  }
  if (
    [
      "bad-beats",
      "demolished",
      "take-the-low-road",
      "take-the-high-road",
    ].includes(slug)
  ) {
    return withRanks(
      pairs
        .filter(
          ([left, right]) =>
            slug.startsWith("take-") || left.points !== right.points,
        )
        .map((pair) => {
          const value = slug.startsWith("take-")
            ? Math.round((pair[0].points + pair[1].points) * 100) / 100
            : Math.round(Math.abs(pair[0].points - pair[1].points) * 100) / 100;
          return {
            label: gameLabel(pair),
            detail: gameDetail(pair),
            value,
            valueLabel: value.toFixed(2),
            href: `/matchups/${pair[0].matchupId}`,
          };
        }),
      definition.direction,
    );
  }
  if (slug === "most-wins" || slug === "best-manager-record") {
    const totals = new Map<
      string,
      { manager: DomainManager; wins: number; losses: number; ties: number }
    >();
    for (const side of dataset.sides) {
      for (const manager of side.managers) {
        const item = totals.get(manager.id) ?? {
          manager,
          wins: 0,
          losses: 0,
          ties: 0,
        };
        if (side.outcome === "win") item.wins += 1;
        if (side.outcome === "loss") item.losses += 1;
        if (side.outcome === "tie") item.ties += 1;
        totals.set(manager.id, item);
      }
    }
    return withRanks(
      [...totals.values()]
        .filter(
          (item) =>
            slug === "most-wins" || item.wins + item.losses + item.ties >= 20,
        )
        .map((item) => {
          const games = item.wins + item.losses + item.ties;
          const value =
            slug === "most-wins"
              ? item.wins
              : Math.round(((item.wins + item.ties * 0.5) / games) * 1000) /
                1000;
          return {
            label: item.manager.name,
            detail: `${item.wins}–${item.losses}${item.ties ? `–${item.ties}` : ""}`,
            value,
            valueLabel:
              slug === "most-wins"
                ? String(value)
                : `${(value * 100).toFixed(1)}%`,
            href: managerHref(item.manager),
          };
        }),
      "desc",
    );
  }
  if (slug === "favorite-players" || slug === "real-dedication") {
    const totals = new Map<
      string,
      {
        manager: DomainManager;
        playerId: string;
        playerName: string;
        games: number;
        points: number;
      }
    >();
    for (const lineup of dataset.lineups.filter(
      (entry) => entry.classification === "starter",
    )) {
      for (const manager of lineup.managers) {
        const key = `${manager.id}:${lineup.playerId}`;
        const item = totals.get(key) ?? {
          manager,
          playerId: lineup.playerId,
          playerName: lineup.playerName,
          games: 0,
          points: 0,
        };
        item.games += 1;
        item.points += lineup.points;
        totals.set(key, item);
      }
    }
    return withRanks(
      [...totals.values()]
        .filter((item) => slug === "favorite-players" || item.games >= 10)
        .map((item) => {
          const value =
            slug === "favorite-players"
              ? item.games
              : Math.round((item.points / item.games) * 100) / 100;
          return {
            label: item.manager.name,
            detail: `${item.playerName} · ${item.games} starts`,
            value,
            valueLabel:
              slug === "favorite-players" ? String(value) : value.toFixed(2),
            href: managerHref(item.manager),
            secondaryHref: `/players/${item.playerId}`,
          };
        }),
      definition.direction,
    );
  }
  if (slug === "postseason-appearances") {
    const seasons = new Map<
      string,
      { manager: DomainManager; years: Set<number> }
    >();
    for (const side of dataset.sides.filter(
      (candidate) => candidate.phase === "winners",
    )) {
      for (const manager of side.managers) {
        const item = seasons.get(manager.id) ?? { manager, years: new Set() };
        item.years.add(side.year);
        seasons.set(manager.id, item);
      }
    }
    return withRanks(
      [...seasons.values()].map((item) => ({
        label: item.manager.name,
        detail: [...item.years].sort().join(", "),
        value: item.years.size,
        valueLabel: String(item.years.size),
        href: managerHref(item.manager),
      })),
      "desc",
    );
  }
  if (slug === "put-me-in-coach") {
    return withRanks(
      dataset.lineups
        .filter(
          (entry) =>
            entry.classification === "bench" && entry.playerPosition !== "QB",
        )
        .flatMap((entry) =>
          entry.managers.map((manager) => ({
            label: entry.playerName,
            detail: `${manager.name} · ${entry.teamName} · ${entry.year} W${entry.week}`,
            value: entry.points,
            valueLabel: entry.points.toFixed(2),
            href: `/players/${entry.playerId}`,
            secondaryHref: managerHref(manager),
          })),
        ),
      "desc",
    );
  }
  if (slug === "domination") {
    const totals = new Map<
      string,
      {
        owner: DomainManager;
        opponent: DomainManager;
        wins: number;
        losses: number;
        ties: number;
      }
    >();
    for (const [left, right] of pairs) {
      for (const [ownerSide, opponentSide] of [
        [left, right],
        [right, left],
      ] as const) {
        for (const owner of ownerSide.managers) {
          for (const opponent of opponentSide.managers) {
            const key = `${owner.id}:${opponent.id}`;
            const item = totals.get(key) ?? {
              owner,
              opponent,
              wins: 0,
              losses: 0,
              ties: 0,
            };
            if (ownerSide.outcome === "win") item.wins += 1;
            if (ownerSide.outcome === "loss") item.losses += 1;
            if (ownerSide.outcome === "tie") item.ties += 1;
            totals.set(key, item);
          }
        }
      }
    }
    return withRanks(
      [...totals.values()]
        .filter((item) => item.wins + item.losses + item.ties >= 3)
        .map((item) => {
          const games = item.wins + item.losses + item.ties;
          const value =
            Math.round(((item.wins + item.ties * 0.5) / games) * 1000) / 1000;
          return {
            label: `${item.owner.name} over ${item.opponent.name}`,
            detail: `${item.wins}–${item.losses}${item.ties ? `–${item.ties}` : ""}`,
            value,
            valueLabel: `${(value * 100).toFixed(1)}%`,
            href: `/rivalries/${item.owner.slug}/${item.opponent.slug}`,
          };
        }),
      "desc",
    );
  }
  if (slug === "getting-away-with-it" || slug === "cursed") {
    const targetOutcome = slug === "getting-away-with-it" ? "win" : "loss";
    return withRanks(
      pairs.flatMap((pair) => {
        const side = pair.find(
          (candidate) => candidate.outcome === targetOutcome,
        );
        const opponent = pair.find((candidate) => candidate !== side);
        if (!side || !opponent) return [];
        return [
          {
            label: `${side.teamName} ${targetOutcome === "win" ? "beat" : "lost to"} ${opponent.teamName}`,
            detail: `${side.year} · Week ${side.week} · ${side.managers
              .map((manager) => manager.name)
              .join(" & ")}`,
            value: side.points,
            valueLabel: side.points.toFixed(2),
            href: `/matchups/${side.matchupId}`,
          },
        ];
      }),
      definition.direction,
    );
  }
  if (slug === "heater" || slug === "the-darkness") {
    const targetOutcome = slug === "heater" ? "win" : "loss";
    const games = [...dataset.sides].sort(
      (left, right) =>
        left.year - right.year ||
        left.week - right.week ||
        left.matchupId.localeCompare(right.matchupId),
    );
    const streaks = new Map<
      string,
      {
        manager: DomainManager;
        current: number;
        currentStart: DomainSide | null;
        best: number;
        bestStart: DomainSide | null;
        bestEnd: DomainSide | null;
      }
    >();
    for (const side of games) {
      for (const manager of side.managers) {
        const item = streaks.get(manager.id) ?? {
          manager,
          current: 0,
          currentStart: null,
          best: 0,
          bestStart: null,
          bestEnd: null,
        };
        if (side.outcome === targetOutcome) {
          if (item.current === 0) item.currentStart = side;
          item.current += 1;
          if (item.current > item.best) {
            item.best = item.current;
            item.bestStart = item.currentStart;
            item.bestEnd = side;
          }
        } else {
          item.current = 0;
          item.currentStart = null;
        }
        streaks.set(manager.id, item);
      }
    }
    return withRanks(
      [...streaks.values()]
        .filter(
          (item) => item.best > 0 && item.bestStart !== null && item.bestEnd,
        )
        .map((item) => ({
          label: item.manager.name,
          detail: `${item.bestStart?.year} W${item.bestStart?.week} → ${item.bestEnd?.year} W${item.bestEnd?.week}`,
          value: item.best,
          valueLabel: `${item.best} games`,
          href: managerHref(item.manager),
        })),
      "desc",
    );
  }
  if (slug === "giant-killer") {
    const ratings = calculateManagerElo(dataset.sides);
    const pregameRatings = new Map<string, number>();
    for (const [managerId, rating] of ratings) {
      for (const point of rating.history) {
        pregameRatings.set(
          `${managerId}:${point.matchupId}`,
          point.rating - point.delta,
        );
      }
    }
    const enteringRating = (side: DomainSide) =>
      side.managers.reduce(
        (total, manager) =>
          total +
          (pregameRatings.get(`${manager.id}:${side.matchupId}`) ??
            ELO_INITIAL_RATING),
        0,
      ) / side.managers.length;
    return withRanks(
      pairs.flatMap((pair) => {
        const winner = pair.find((side) => side.outcome === "win");
        const loser = pair.find((side) => side.outcome === "loss");
        if (!winner || !loser) return [];
        const difference = enteringRating(loser) - enteringRating(winner);
        if (difference <= 0) return [];
        return [
          {
            label: `${winner.teamName} over ${loser.teamName}`,
            detail: `${winner.year} · Week ${winner.week} · ${winner.managers
              .map((manager) => manager.name)
              .join(" & ")}`,
            value: Math.round(difference * 100) / 100,
            valueLabel: `${Math.round(difference)} Elo`,
            href: `/matchups/${winner.matchupId}`,
            year: winner.year,
            phase: winner.phase,
          },
        ];
      }),
      "desc",
    );
  }
  if (slug === "schedule-merchant" || slug === "schedule-from-hell") {
    const rows = dataset.seasons.flatMap((season) =>
      calculateAllPlayStandings(
        dataset.teams.filter((team) => team.year === season.year),
        dataset.sides.filter((side) => side.year === season.year),
      )
        .filter((row) => row.actualGames > 0)
        .map((row) => ({
          label: row.teamName,
          detail: `${season.year} · ${row.managerNames.join(" & ")} · ${row.actualWins}–${row.actualLosses} actual`,
          value: row.luckDelta,
          valueLabel: `${row.luckDelta >= 0 ? "+" : ""}${row.luckDelta.toFixed(2)} wins`,
          href: `/history/all-play?year=${season.year}`,
        })),
    );
    return withRanks(rows, definition.direction);
  }
  if (slug === "playoff-mode") {
    const scoring = new Map<
      string,
      {
        team: DomainDataset["teams"][number];
        regularPoints: number;
        regularGames: number;
        postseasonPoints: number;
        postseasonGames: number;
      }
    >();
    const teams = new Map(dataset.teams.map((team) => [team.id, team]));
    for (const side of dataset.sides) {
      const team = teams.get(side.teamId);
      if (!team) continue;
      const item = scoring.get(team.id) ?? {
        team,
        regularPoints: 0,
        regularGames: 0,
        postseasonPoints: 0,
        postseasonGames: 0,
      };
      if (side.phase === "regular") {
        item.regularPoints += side.points;
        item.regularGames += 1;
      } else {
        item.postseasonPoints += side.points;
        item.postseasonGames += 1;
      }
      scoring.set(team.id, item);
    }
    return withRanks(
      [...scoring.values()]
        .filter((item) => item.regularGames > 0 && item.postseasonGames >= 2)
        .map((item) => {
          const regular = item.regularPoints / item.regularGames;
          const postseason = item.postseasonPoints / item.postseasonGames;
          const difference = Math.round((postseason - regular) * 100) / 100;
          return {
            label: item.team.name,
            detail: `${item.team.year} · ${item.team.managers
              .map((manager) => manager.name)
              .join(
                " & ",
              )} · ${regular.toFixed(2)} → ${postseason.toFixed(2)} PPG`,
            value: difference,
            valueLabel: `${difference >= 0 ? "+" : ""}${difference.toFixed(2)} PPG`,
            href: `/seasons/${item.team.year}`,
          };
        }),
      "desc",
    );
  }
  if (slug === "cinderella-run") {
    return withRanks(
      dataset.teams
        .filter((team) => team.finalPlace === 1)
        .flatMap((champion) => {
          const groupTeams = dataset.teams.filter(
            (team) =>
              team.year === champion.year &&
              (champion.groupLabel === null ||
                team.groupLabel === champion.groupLabel),
          );
          const standing = calculateStandings(
            groupTeams,
            dataset.sides.filter(
              (side) =>
                side.year === champion.year &&
                groupTeams.some((team) => team.id === side.teamId),
            ),
          ).find((row) => row.teamId === champion.id);
          if (!standing) return [];
          return [
            {
              label: champion.name,
              detail: `${champion.year} · ${champion.managers
                .map((manager) => manager.name)
                .join(
                  " & ",
                )}${champion.groupLabel ? ` · ${champion.groupLabel}` : ""}`,
              value: standing.rank,
              valueLabel: `No. ${standing.rank} seed`,
              href: `/seasons/${champion.year}`,
            },
          ];
        }),
      "desc",
    );
  }
  if (slug === "roller-coaster") {
    const scores = new Map<string, number[]>();
    for (const side of dataset.sides.filter(
      (candidate) => candidate.phase === "regular",
    )) {
      const values = scores.get(side.teamId) ?? [];
      values.push(side.points);
      scores.set(side.teamId, values);
    }
    return withRanks(
      dataset.teams.flatMap((team) => {
        const values = scores.get(team.id) ?? [];
        if (values.length < 10) return [];
        const average =
          values.reduce((total, value) => total + value, 0) / values.length;
        const variance =
          values.reduce((total, value) => total + (value - average) ** 2, 0) /
          values.length;
        const deviation = Math.round(Math.sqrt(variance) * 100) / 100;
        return [
          {
            label: team.name,
            detail: `${team.year} · ${team.managers
              .map((manager) => manager.name)
              .join(" & ")} · ${average.toFixed(2)} PPG`,
            value: deviation,
            valueLabel: `${deviation.toFixed(2)} SD`,
            href: `/seasons/${team.year}`,
          },
        ];
      }),
      "desc",
    );
  }
  if (slug === "best-regular-season") {
    const wins = new Map<string, number>();
    for (const side of dataset.sides.filter(
      (candidate) =>
        candidate.phase === "regular" && candidate.outcome === "win",
    )) {
      wins.set(side.teamId, (wins.get(side.teamId) ?? 0) + 1);
    }
    return withRanks(
      dataset.teams.map((team) => ({
        label: team.name,
        detail: `${team.year} · ${team.managers.map((manager) => manager.name).join(" & ")}`,
        value: wins.get(team.id) ?? 0,
        valueLabel: String(wins.get(team.id) ?? 0),
        href: `/seasons/${team.year}`,
      })),
      "desc",
    );
  }
  return [];
}
