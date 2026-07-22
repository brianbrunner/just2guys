import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { identityRegistry, resolveIdentity } from "../server/identity/registry";
import type { SleeperSnapshot } from "../server/import/sleeper-sql";

const snapshots = JSON.parse(
  readFileSync(
    new URL("../generated/sleeper-backfill/snapshots.json", import.meta.url),
    "utf8",
  ),
) as { snapshots: SleeperSnapshot[] };

describe("reviewed cross-provider identities", () => {
  it("maps all 16 cross-provider accounts to Yahoo people", () => {
    const crossProvider = identityRegistry.mappings.filter(
      (mapping) => mapping.yahooGuid,
    );
    expect(crossProvider).toHaveLength(16);
    for (const mapping of crossProvider) {
      expect(
        resolveIdentity("sleeper", mapping.sleeperUserId, "source name"),
      ).toMatchObject({
        canonicalKey: `yahoo:${mapping.yahooGuid!}`,
        preferredName: mapping.preferredName,
        reviewed: true,
      });
      expect(
        resolveIdentity("yahoo", mapping.yahooGuid!, "source name"),
      ).toMatchObject({
        canonicalKey: `yahoo:${mapping.yahooGuid!}`,
        reviewed: true,
      });
    }
  });

  it("has no unresolved roster accounts in reviewed complete Sleeper seasons", () => {
    const unresolved = snapshots.snapshots
      .filter(
        (snapshot) =>
          snapshot.configured.enabled &&
          [2023, 2024, 2025].includes(snapshot.year),
      )
      .flatMap((snapshot) =>
        snapshot.rosters.flatMap((roster) => [
          roster.owner_id,
          ...(roster.co_owners ?? []),
        ]),
      )
      .filter((id): id is string => Boolean(id))
      .filter(
        (id) => !resolveIdentity("sleeper", id, `Sleeper ${id}`).reviewed,
      );
    expect([...new Set(unresolved)]).toEqual([]);
  });

  it("uses Dan as the reviewed display identity for the 2022-only account", () => {
    expect(
      resolveIdentity("sleeper", "788252313520320512", "yuzeh"),
    ).toMatchObject({
      canonicalKey: "sleeper:788252313520320512",
      slug: "dan",
      preferredName: "Dan",
      aliases: ["Dan", "yuzeh"],
      reviewed: true,
    });
  });

  it("has no unresolved participants in review-gated sources", () => {
    const unresolved = snapshots.snapshots
      .filter((snapshot) => [2021, 2022].includes(snapshot.year))
      .flatMap((snapshot) =>
        snapshot.rosters.flatMap((roster) => [
          roster.owner_id,
          ...(roster.co_owners ?? []),
        ]),
      )
      .filter((id): id is string => Boolean(id))
      .filter(
        (id) => !resolveIdentity("sleeper", id, `Sleeper ${id}`).reviewed,
      );
    expect([...new Set(unresolved)]).toEqual([]);
  });
});
