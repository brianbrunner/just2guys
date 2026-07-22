import type { DomainManager, DomainSide } from "./dataset";

export const ELO_INITIAL_RATING = 1500;
export const ELO_K_FACTOR = 20;

export interface ManagerEloPoint {
  matchupId: string;
  year: number;
  week: number;
  rating: number;
  delta: number;
  outcome: "win" | "loss" | "tie";
  opponents: string;
}

export interface ManagerEloRating {
  manager: DomainManager;
  current: number;
  peak: number;
  low: number;
  games: number;
  history: ManagerEloPoint[];
}

function expectedScore(rating: number, opponentRating: number) {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

function actualScore(outcome: string) {
  if (outcome === "win") return 1;
  if (outcome === "tie") return 0.5;
  return 0;
}

function averageRating(
  managers: DomainManager[],
  ratings: Map<string, number>,
) {
  return (
    managers.reduce(
      (total, manager) =>
        total + (ratings.get(manager.id) ?? ELO_INITIAL_RATING),
      0,
    ) / managers.length
  );
}

export function calculateManagerElo(sides: DomainSide[]) {
  const matchups = new Map<string, DomainSide[]>();
  for (const side of sides) {
    if (
      side.phase === "placement" ||
      (side.status !== "final" && side.status !== "corrected")
    )
      continue;
    const matchup = matchups.get(side.matchupId) ?? [];
    matchup.push(side);
    matchups.set(side.matchupId, matchup);
  }
  const games = [...matchups.values()]
    .filter(
      (matchup) =>
        matchup.length === 2 &&
        matchup.every(
          (side) =>
            side.managers.length > 0 &&
            ["win", "loss", "tie"].includes(side.outcome),
        ),
    )
    .sort(
      (left, right) =>
        (left[0]?.year ?? 0) - (right[0]?.year ?? 0) ||
        (left[0]?.week ?? 0) - (right[0]?.week ?? 0) ||
        (left[0]?.matchupId ?? "").localeCompare(right[0]?.matchupId ?? ""),
    );
  const ratings = new Map<string, number>();
  const results = new Map<string, ManagerEloRating>();

  for (const [left, right] of games) {
    if (!left || !right) continue;
    const leftRating = averageRating(left.managers, ratings);
    const rightRating = averageRating(right.managers, ratings);
    const leftDelta =
      ELO_K_FACTOR *
      (actualScore(left.outcome) - expectedScore(leftRating, rightRating));
    const rightDelta = -leftDelta;

    for (const [side, delta, opponents] of [
      [left, leftDelta, right.managers],
      [right, rightDelta, left.managers],
    ] as const) {
      for (const manager of side.managers) {
        const previous = ratings.get(manager.id) ?? ELO_INITIAL_RATING;
        const current = previous + delta;
        ratings.set(manager.id, current);
        const result = results.get(manager.id) ?? {
          manager,
          current: ELO_INITIAL_RATING,
          peak: ELO_INITIAL_RATING,
          low: ELO_INITIAL_RATING,
          games: 0,
          history: [],
        };
        result.current = current;
        result.peak = Math.max(result.peak, current);
        result.low = Math.min(result.low, current);
        result.games += 1;
        result.history.push({
          matchupId: side.matchupId,
          year: side.year,
          week: side.week,
          rating: current,
          delta,
          outcome: side.outcome as "win" | "loss" | "tie",
          opponents: opponents.map((opponent) => opponent.name).join(" & "),
        });
        results.set(manager.id, result);
      }
    }
  }

  return results;
}
