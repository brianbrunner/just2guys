import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { seasonManifests } from "../manifests/registry";
import type { SleeperSnapshot } from "./sleeper-sql";

export async function writeSleeperReconciliation(input: {
  outputDirectory: string;
  generatedAt: string;
  snapshots: SleeperSnapshot[];
  requestCount: number | null;
  referencedPlayerCount: number;
  resolvedPlayerCount: number;
  transport: string;
}) {
  const report = {
    generatedAt: input.generatedAt,
    transport: input.transport,
    requestCount: input.requestCount,
    referencedPlayerCount: input.referencedPlayerCount,
    resolvedPlayerCount: input.resolvedPlayerCount,
    seasons: seasonManifests
      .filter((manifest) => manifest.year >= 2021)
      .map((manifest) => ({
        year: manifest.year,
        reviewStatus: manifest.review.status,
        publishableForCareerTotals:
          manifest.status === "complete" &&
          manifest.review.status === "reviewed",
        sources: input.snapshots
          .filter((snapshot) => snapshot.year === manifest.year)
          .map((snapshot) => ({
            leagueId: snapshot.league.league_id,
            name: snapshot.league.name,
            configuredEnabled: snapshot.configured.enabled,
            configuredReason: snapshot.configured.ignoredReason ?? null,
            upstreamStatus: snapshot.league.status,
            upstreamSeason: snapshot.league.season,
            upstreamTeamCount: snapshot.league.settings.num_teams,
            playoffWeekStart:
              snapshot.league.settings.playoff_week_start ?? null,
            lastScoredWeek: snapshot.league.settings.last_scored_leg ?? 0,
            userCount: snapshot.users.length,
            rosterCount: snapshot.rosters.length,
            owners: snapshot.rosters.map((roster) => {
              const owner = snapshot.users.find(
                (user) => user.user_id === roster.owner_id,
              );
              return {
                rosterId: roster.roster_id,
                ownerId: roster.owner_id,
                displayName: owner?.display_name ?? null,
                teamName: owner?.metadata?.team_name ?? null,
                coOwnerIds: roster.co_owners ?? [],
              };
            }),
            weeklySideCounts: snapshot.weeks.map((week) => ({
              week: week.week,
              sides: week.matchups.length,
            })),
            winnersBracket: snapshot.winnersBracket,
            losersBracket: snapshot.losersBracket,
            contentHash: snapshot.contentHash,
          })),
      })),
  };
  const outputDirectory = resolve(input.outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    resolve(outputDirectory, "reconciliation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  const reviewGates = report.seasons
    .filter((season) => !season.publishableForCareerTotals)
    .map((season) => season.year)
    .join(", ");
  await writeFile(
    resolve(outputDirectory, "reconciliation.md"),
    [
      "# Sleeper backfill reconciliation",
      "",
      `Generated: ${input.generatedAt}`,
      `Transport: ${input.transport}`,
      `Requests: ${input.requestCount ?? "frozen snapshot"}; referenced players: ${input.referencedPlayerCount}; resolved players: ${input.resolvedPlayerCount}`,
      "",
      "| Season | Source | Enabled | Upstream status | Rosters | Users | Last scored week |",
      "| --- | --- | :---: | --- | ---: | ---: | ---: |",
      ...report.seasons.flatMap((season) =>
        season.sources.map(
          (source) =>
            `| ${season.year} | ${source.name} (\`${source.leagueId}\`) | ${source.configuredEnabled ? "yes" : "no"} | ${source.upstreamStatus} | ${source.rosterCount} | ${source.userCount} | ${source.lastScoredWeek} |`,
        ),
      ),
      "",
      reviewGates
        ? `Review-gated seasons excluded from career totals: ${reviewGates}.`
        : "All completed seasons are reviewed for career totals.",
      "",
    ].join("\n"),
    "utf8",
  );
}
