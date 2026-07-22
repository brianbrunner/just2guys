import type { DomainDataset, DomainManager, DomainSide } from "./dataset";

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
