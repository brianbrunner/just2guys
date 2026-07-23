import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { seasonManifests } from "../manifests/registry";
import { SleeperApiError, SleeperClient, contentHash } from "../sleeper/client";
import { buildSleeperImportSql } from "./sleeper-sql";
import type { SleeperBracketMatch, SleeperPlayer } from "../sleeper/schemas";

async function optionalBracket(request: () => Promise<SleeperBracketMatch[]>) {
  try {
    return await request();
  } catch (error) {
    if (error instanceof SleeperApiError && error.status === 404) return [];
    throw error;
  }
}

async function inBatches<T, R>(
  values: T[],
  size: number,
  task: (value: T) => Promise<R>,
) {
  const output: R[] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(
      ...(await Promise.all(values.slice(index, index + size).map(task))),
    );
  }
  return output;
}

async function main() {
  const outputDir = resolve(process.argv[2] ?? "generated/sleeper-backfill");
  const client = new SleeperClient();
  const generatedAt = new Date().toISOString();
  const candidates = seasonManifests
    .filter((manifest) => manifest.year >= 2021)
    .flatMap((manifest) =>
      manifest.sources.map((source) => ({
        manifest,
        source,
        inspectWeeks: source.enabled || manifest.year === 2021,
      })),
    );

  const snapshots = await inBatches(
    candidates,
    3,
    async ({ manifest, source, inspectWeeks }) => {
      const league = await client.league(source.externalId);
      const [users, rosters, winnersBracket, losersBracket] = await Promise.all(
        [
          client.users(source.externalId),
          client.rosters(source.externalId),
          optionalBracket(() => client.winnersBracket(source.externalId)),
          optionalBracket(() => client.losersBracket(source.externalId)),
        ],
      );
      const weeks = inspectWeeks
        ? await inBatches(
            Array.from({ length: manifest.finalWeek }, (_, index) => index + 1),
            4,
            async (week) => ({
              week,
              matchups: await client.matchups(source.externalId, week),
            }),
          )
        : [];
      const drafts =
        source.enabled && source.role === "full"
          ? await inBatches(
              await client.drafts(source.externalId),
              3,
              async (draft) => ({
                draft,
                picks: await client.draftPicks(draft.draft_id),
              }),
            )
          : [];
      const transactions =
        source.enabled && source.role === "full"
          ? [
              ...new Map(
                (
                  await inBatches(
                    Array.from(
                      { length: manifest.finalWeek + 1 },
                      (_, week) => week,
                    ),
                    4,
                    async (week) =>
                      client.transactions(source.externalId, week),
                  )
                )
                  .flat()
                  .map((transaction) => [
                    transaction.transaction_id,
                    transaction,
                  ]),
              ).values(),
            ]
          : [];
      const snapshot = {
        year: manifest.year,
        configured: source,
        league,
        users,
        rosters,
        winnersBracket,
        losersBracket,
        weeks,
        drafts,
        transactions,
      };
      return { ...snapshot, contentHash: await contentHash(snapshot) };
    },
  );

  const referencedPlayerIds = new Set<string>();
  for (const snapshot of snapshots) {
    for (const week of snapshot.weeks) {
      for (const matchup of week.matchups) {
        for (const playerId of matchup.players)
          referencedPlayerIds.add(playerId);
      }
    }
    for (const draft of snapshot.drafts) {
      for (const pick of draft.picks) referencedPlayerIds.add(pick.player_id);
    }
    for (const transaction of snapshot.transactions) {
      for (const playerId of Object.keys(transaction.adds))
        referencedPlayerIds.add(playerId);
      for (const playerId of Object.keys(transaction.drops))
        referencedPlayerIds.add(playerId);
    }
  }
  const directory = await client.players();
  const players: Record<string, SleeperPlayer> = {};
  for (const playerId of [...referencedPlayerIds].sort()) {
    const player = directory[playerId];
    if (player) players[playerId] = player;
  }

  const report = {
    generatedAt,
    transport:
      "Sleeper public REST API; no authentication, cookies, or private endpoints",
    requestCount: client.requestCount,
    referencedPlayerCount: referencedPlayerIds.size,
    resolvedPlayerCount: Object.keys(players).length,
    seasons: seasonManifests
      .filter((manifest) => manifest.year >= 2021)
      .map((manifest) => ({
        year: manifest.year,
        reviewStatus: manifest.review.status,
        publishableForCareerTotals:
          manifest.status === "complete" &&
          manifest.review.status === "reviewed",
        sources: snapshots
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

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    resolve(outputDir, "snapshots.json"),
    `${JSON.stringify({ generatedAt, snapshots, players }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    resolve(outputDir, "sleeper-import.sql"),
    buildSleeperImportSql({
      manifests: seasonManifests,
      snapshots,
      players,
      generatedAt,
    }),
    "utf8",
  );
  await writeFile(
    resolve(outputDir, "reconciliation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  const lines = [
    "# Sleeper backfill reconciliation",
    "",
    `Generated: ${generatedAt}`,
    "Transport: public Sleeper REST API only (no authentication)",
    `Requests: ${client.requestCount}; referenced players: ${referencedPlayerIds.size}; resolved players: ${Object.keys(players).length}`,
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
    "Completed seasons with reviewed manifests are included in canonical career totals.",
    "",
  ];
  await writeFile(
    resolve(outputDir, "reconciliation.md"),
    lines.join("\n"),
    "utf8",
  );
  console.log(
    `Fetched ${snapshots.length} configured league sources with ${client.requestCount} public API requests.`,
  );
  console.log(`Wrote reconciliation and compact snapshots to ${outputDir}.`);
}

await main();
