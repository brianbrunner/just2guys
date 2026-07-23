import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { seasonManifests } from "../manifests/registry";
import { buildSleeperImportSql, type SleeperSnapshot } from "./sleeper-sql";
import { writeSleeperReconciliation } from "./sleeper-report";
import type { SleeperPlayer } from "../sleeper/schemas";

const inputPath = resolve(
  process.argv[2] ?? "generated/sleeper-backfill/snapshots.json",
);
const outputPath = resolve(
  process.argv[3] ?? "generated/sleeper-backfill/sleeper-import.sql",
);
const input = JSON.parse(await readFile(inputPath, "utf8")) as {
  generatedAt: string;
  snapshots: SleeperSnapshot[];
  players: Record<string, SleeperPlayer>;
};
const configuredSnapshots = input.snapshots.map((snapshot) => {
  const manifest = seasonManifests.find(
    (candidate) => candidate.year === snapshot.year,
  );
  const configured = manifest?.sources.find(
    (source) =>
      source.provider === "sleeper" &&
      source.externalId === snapshot.league.league_id,
  );
  if (!configured)
    throw new Error(
      `Frozen snapshot ${snapshot.league.league_id} is absent from the ${snapshot.year} manifest.`,
    );
  return { ...snapshot, configured };
});

await writeFile(
  outputPath,
  buildSleeperImportSql({
    manifests: seasonManifests,
    snapshots: configuredSnapshots,
    players: input.players,
    generatedAt: input.generatedAt,
  }),
  "utf8",
);
const referencedPlayerIds = new Set(
  input.snapshots.flatMap((snapshot) => [
    ...snapshot.weeks.flatMap((week) =>
      week.matchups.flatMap((matchup) => matchup.players),
    ),
    ...(snapshot.drafts ?? []).flatMap((draft) =>
      draft.picks.map((pick) => pick.player_id),
    ),
    ...(snapshot.transactions ?? []).flatMap((transaction) => [
      ...Object.keys(transaction.adds),
      ...Object.keys(transaction.drops),
    ]),
  ]),
);
await writeSleeperReconciliation({
  outputDirectory: dirname(outputPath),
  generatedAt: input.generatedAt,
  snapshots: configuredSnapshots,
  requestCount: null,
  referencedPlayerCount: referencedPlayerIds.size,
  resolvedPlayerCount: Object.keys(input.players).length,
  transport: "Frozen snapshots from Sleeper public REST API; no authentication",
});
console.log(`Generated ${outputPath} from ${inputPath}.`);
