import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import releaseValues from "../../config/release.json";
import snapshotsValue from "../../generated/sleeper-backfill/snapshots.json";
import { resolveIdentity } from "../identity/registry";
import type { SleeperSnapshot } from "../import/sleeper-sql";
import { seasonManifests } from "../manifests/registry";
import { evaluateReleaseGates } from "./gates";

const releaseSchema = z.object({
  version: z.literal(1),
  legacyYahooCredentialRevoked: z.boolean(),
  legacySleeperCredentialRevoked: z.boolean(),
  productionSyncPathConfirmed: z.boolean(),
  productionUrl: z.url().nullable(),
});
const release = releaseSchema.parse(releaseValues);
const snapshots = snapshotsValue as unknown as {
  snapshots: SleeperSnapshot[];
};
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const wrangler = await readFile(resolve(projectRoot, "wrangler.jsonc"), "utf8");
const activeYearMatch = wrangler.match(/"ACTIVE_SEASON"\s*:\s*"(\d{4})"/);
if (!activeYearMatch)
  throw new Error("wrangler.jsonc does not define a four-digit ACTIVE_SEASON");
const activeYear = Number(activeYearMatch[1]);
const activeSeason = seasonManifests.find(
  (manifest) => manifest.year === activeYear,
);
const reviewYears = seasonManifests
  .filter(
    (manifest) =>
      manifest.year < activeYear && manifest.review.status !== "reviewed",
  )
  .map((manifest) => manifest.year);
const unresolvedAccounts = [
  ...new Set(
    snapshots.snapshots
      .filter((snapshot) => snapshot.year <= activeYear)
      .flatMap((snapshot) =>
        snapshot.rosters.flatMap((roster) => [
          roster.owner_id,
          ...(roster.co_owners ?? []),
        ]),
      )
      .filter((id): id is string => Boolean(id))
      .filter(
        (id) => !resolveIdentity("sleeper", id, `Sleeper ${id}`).reviewed,
      ),
  ),
];
const gates = evaluateReleaseGates({
  d1Configured: !wrangler.includes("REPLACE_WITH_PRODUCTION_D1_ID"),
  reviewYears,
  unresolvedAccounts,
  legacyYahooCredentialRevoked: release.legacyYahooCredentialRevoked,
  legacySleeperCredentialRevoked: release.legacySleeperCredentialRevoked,
  productionSyncPathConfirmed: release.productionSyncPathConfirmed,
  productionUrl: release.productionUrl,
  requireProductionUrl: !process.argv.includes("--predeploy"),
  activeSeasonConfigured: Boolean(
    activeSeason?.sources.some(
      (source) => source.enabled && source.provider === "sleeper",
    ),
  ),
});

for (const gate of gates) {
  console.log(
    `${gate.status === "pass" ? "PASS" : "BLOCKED"} ${gate.id}: ${gate.message}`,
  );
}
const blockers = gates.filter((gate) => gate.status === "blocked");
if (blockers.length > 0) {
  console.error(`Production release blocked by ${blockers.length} gate(s).`);
  process.exitCode = 1;
} else {
  console.log("All production release gates pass.");
}
