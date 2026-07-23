import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { seasonManifests } from "../manifests/registry";
import { SleeperClient, contentHash } from "../sleeper/client";
import type { SleeperPlayer } from "../sleeper/schemas";
import type { SleeperSnapshot } from "./sleeper-sql";

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

const snapshotPath = resolve(
  process.argv[2] ?? "generated/sleeper-backfill/snapshots.json",
);
const input = JSON.parse(await readFile(snapshotPath, "utf8")) as {
  generatedAt: string;
  snapshots: SleeperSnapshot[];
  players: Record<string, SleeperPlayer>;
};
const client = new SleeperClient();
let draftCount = 0;
let transactionCount = 0;

const snapshots = await inBatches(input.snapshots, 2, async (snapshot) => {
  const manifest = seasonManifests.find(
    (candidate) => candidate.year === snapshot.year,
  );
  const source = manifest?.sources.find(
    (candidate) =>
      candidate.provider === "sleeper" &&
      candidate.externalId === snapshot.league.league_id,
  );
  if (!manifest || !source || !source.enabled || source.role !== "full")
    return snapshot;

  const drafts = await client.drafts(snapshot.league.league_id);
  const draftSnapshots = await inBatches(drafts, 3, async (draft) => ({
    draft,
    picks: await client.draftPicks(draft.draft_id),
  }));
  const transactionWeeks = await inBatches(
    Array.from({ length: manifest.finalWeek + 1 }, (_, week) => week),
    4,
    async (week) => client.transactions(snapshot.league.league_id, week),
  );
  const transactions = [
    ...new Map(
      transactionWeeks
        .flat()
        .map((transaction) => [transaction.transaction_id, transaction]),
    ).values(),
  ].sort(
    (left, right) =>
      left.created - right.created ||
      left.transaction_id.localeCompare(right.transaction_id),
  );
  draftCount += draftSnapshots.length;
  transactionCount += transactions.length;
  const nextSnapshot = {
    ...snapshot,
    configured: source,
    drafts: draftSnapshots,
    transactions,
  };
  const hashable = { ...nextSnapshot, contentHash: "" };
  return { ...nextSnapshot, contentHash: await contentHash(hashable) };
});

const referencedPlayerIds = new Set<string>();
for (const snapshot of snapshots) {
  for (const week of snapshot.weeks) {
    for (const matchup of week.matchups) {
      for (const playerId of matchup.players) referencedPlayerIds.add(playerId);
    }
  }
  for (const draft of snapshot.drafts ?? []) {
    for (const pick of draft.picks) referencedPlayerIds.add(pick.player_id);
  }
  for (const transaction of snapshot.transactions ?? []) {
    for (const playerId of Object.keys(transaction.adds))
      referencedPlayerIds.add(playerId);
    for (const playerId of Object.keys(transaction.drops))
      referencedPlayerIds.add(playerId);
  }
}

const directory = await client.players();
const players: Record<string, SleeperPlayer> = {};
for (const playerId of [...referencedPlayerIds].sort()) {
  const player = directory[playerId] ?? input.players[playerId];
  if (player) players[playerId] = player;
}

const generatedAt = new Date().toISOString();
await writeFile(
  snapshotPath,
  `${JSON.stringify({ generatedAt, snapshots, players }, null, 2)}\n`,
  "utf8",
);
console.log(
  `Added ${draftCount} drafts and ${transactionCount} transactions with ${client.requestCount} public Sleeper requests.`,
);
console.log(
  `Frozen ${referencedPlayerIds.size} referenced player IDs in ${snapshotPath}.`,
);
