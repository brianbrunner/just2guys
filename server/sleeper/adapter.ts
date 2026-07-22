import type { SeasonManifest } from "../manifests/schema";
import type {
  SleeperBracketMatch,
  SleeperLeague,
  SleeperMatchup,
} from "./schemas";

export interface CanonicalSleeperMatchup {
  externalId: string;
  week: number;
  phase: "regular" | "winners" | "consolation" | "losers" | "placement";
  round: number | null;
  status: "scheduled" | "live" | "final" | "bye";
  sides: SleeperMatchup[];
}

export function canonicalWeekForSource(
  source: SeasonManifest["sources"][number] | undefined,
  sourceWeek: number,
) {
  if (!source) return sourceWeek;
  return (
    source.weekMap?.[String(sourceWeek)] ??
    sourceWeek + source.canonicalWeekOffset
  );
}

export function sourcesForCanonicalWeek(
  manifest: SeasonManifest,
  canonicalWeek: number,
) {
  return manifest.sources
    .filter(
      (candidate) => candidate.enabled && candidate.provider === "sleeper",
    )
    .map((source) => {
      const explicit = source.weekMap
        ? Object.entries(source.weekMap).find(
            ([, mapped]) => mapped === canonicalWeek,
          )?.[0]
        : undefined;
      const sourceWeek = explicit
        ? Number(explicit)
        : canonicalWeek - source.canonicalWeekOffset;
      return { source, sourceWeek };
    })
    .filter(
      ({ source, sourceWeek }) =>
        sourceWeek >= source.sourceWeekStart &&
        sourceWeek <= source.sourceWeekEnd &&
        canonicalWeekForSource(source, sourceWeek) === canonicalWeek,
    );
}

function pairKey(first?: number | null, second?: number | null) {
  if (!first || !second) return null;
  return [first, second].sort((left, right) => left - right).join(":");
}

function bracketPairs(matches: SleeperBracketMatch[]) {
  const pairs = new Map<string, SleeperBracketMatch>();
  for (const match of matches) {
    const key = pairKey(match.t1, match.t2);
    if (key) pairs.set(key, match);
  }
  return pairs;
}

function bracketPath(
  matches: SleeperBracketMatch[],
  terminal: SleeperBracketMatch | undefined,
  advancingResult: "w" | "l",
) {
  const included = new Set<number>();
  if (!terminal) return included;
  const byId = new Map(matches.map((match) => [match.m, match]));
  const pending = [terminal.m];
  while (pending.length > 0) {
    const matchId = pending.pop();
    if (matchId === undefined || included.has(matchId)) continue;
    included.add(matchId);
    const match = byId.get(matchId);
    if (!match) continue;
    for (const source of [match.t1_from, match.t2_from]) {
      const predecessor = source?.[advancingResult];
      if (typeof predecessor === "number") pending.push(predecessor);
    }
  }
  return included;
}

function meaningfulWinnerMatches(matches: SleeperBracketMatch[]) {
  const included = bracketPath(
    matches,
    matches.find((match) => match.p === 1),
    "w",
  );
  const finalRound = Math.max(0, ...matches.map((match) => match.r));
  const thirdPlace = matches.find(
    (match) => match.p === 3 && match.r === finalRound,
  );
  if (thirdPlace) included.add(thirdPlace.m);
  return included;
}

function meaningfulLoserMatches(matches: SleeperBracketMatch[]) {
  // Sleeper's consolation bracket is an inverse-seeded path: the worst seeds
  // receive opening-round byes, then bracket winners continue toward p=1.
  // In this league, p=1 is the last-place game—not the largest p value.
  return bracketPath(
    matches,
    matches.find((match) => match.p === 1),
    "w",
  );
}

export function adaptSleeperWeek(input: {
  leagueId: string;
  week: number;
  source?: SeasonManifest["sources"][number];
  manifest: SeasonManifest;
  league: SleeperLeague;
  matchups: SleeperMatchup[];
  winnersBracket: SleeperBracketMatch[];
  losersBracket: SleeperBracketMatch[];
  observedWeek: number;
}): CanonicalSleeperMatchup[] {
  const canonicalWeek = canonicalWeekForSource(input.source, input.week);
  const groups = new Map<string, SleeperMatchup[]>();
  for (const side of input.matchups) {
    const groupId =
      side.matchup_id === null
        ? `bye-${side.roster_id}`
        : String(side.matchup_id);
    const list = groups.get(groupId) ?? [];
    list.push(side);
    groups.set(groupId, list);
  }
  const winnerPairs = bracketPairs(input.winnersBracket);
  const loserPairs = bracketPairs(input.losersBracket);
  const meaningfulWinners = meaningfulWinnerMatches(input.winnersBracket);
  const meaningfulLosers = meaningfulLoserMatches(input.losersBracket);
  return [...groups.entries()].map(([groupId, sides]) => {
    const key = pairKey(sides[0]?.roster_id, sides[1]?.roster_id);
    const winnerMatch = key ? winnerPairs.get(key) : undefined;
    const loserMatch = key ? loserPairs.get(key) : undefined;
    let phase: CanonicalSleeperMatchup["phase"] = "regular";
    if (canonicalWeek > input.manifest.regularSeasonEndWeek) {
      if (winnerMatch) {
        if (!meaningfulWinners.has(winnerMatch.m)) phase = "placement";
        else phase = winnerMatch.p === 3 ? "consolation" : "winners";
      } else if (loserMatch) {
        phase = meaningfulLosers.has(loserMatch.m) ? "losers" : "placement";
      } else phase = "placement";
    }
    const lastScoredWeek = input.league.settings.last_scored_leg ?? 0;
    const status =
      sides.length < 2
        ? "bye"
        : input.week <= lastScoredWeek
          ? "final"
          : input.week === input.observedWeek
            ? "live"
            : "scheduled";
    return {
      externalId: `${input.leagueId}:${input.week}:${groupId}`,
      week: canonicalWeek,
      phase,
      round: winnerMatch?.r ?? loserMatch?.r ?? null,
      status,
      sides: sides.sort((left, right) => left.roster_id - right.roster_id),
    };
  });
}

export function sleeperOutcome(
  left: SleeperMatchup,
  right: SleeperMatchup | undefined,
  source?: SeasonManifest["sources"][number],
  sourceWeek?: number,
) {
  if (!right) return "bye" as const;
  const leftPoints = sleeperPoints(left, source, sourceWeek);
  const rightPoints = sleeperPoints(right, source, sourceWeek);
  if (leftPoints === rightPoints) return "tie" as const;
  return leftPoints > rightPoints ? ("win" as const) : ("loss" as const);
}

export function sleeperPoints(
  side: SleeperMatchup,
  source?: SeasonManifest["sources"][number],
  sourceWeek?: number,
) {
  if (
    sourceWeek !== undefined &&
    source?.platformScoreWeeks.includes(sourceWeek)
  )
    return side.points ?? 0;
  return side.custom_points ?? side.points ?? 0;
}
