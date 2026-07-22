import { describe, expect, it } from "vitest";

import season2025 from "../config/seasons/2025.json";
import { seasonManifests } from "../server/manifests/registry";
import { seasonManifestSchema } from "../server/manifests/schema";

describe("season manifests", () => {
  it("cover every season exactly once from 2013 through 2026", () => {
    expect(seasonManifests.map((manifest) => manifest.year)).toEqual(
      Array.from({ length: 14 }, (_, index) => 2013 + index),
    );
  });

  it("records the reviewed multi-conference title games explicitly", () => {
    const manifests = seasonManifests.filter((candidate) =>
      [2021, 2022].includes(candidate.year),
    );
    expect(
      manifests.map((manifest) => ({
        year: manifest.year,
        status: manifest.status,
        review: manifest.review.status,
        stitched: manifest.stitchedMatchups.map((matchup) => matchup.id),
      })),
    ).toEqual([
      {
        year: 2021,
        status: "complete",
        review: "reviewed",
        stitched: ["ultimate-championship", "ultimate-last-place"],
      },
      {
        year: 2022,
        status: "complete",
        review: "reviewed",
        stitched: ["ultimate-championship", "ultimate-last-place"],
      },
    ]);
    expect(
      manifests
        .flatMap((manifest) => manifest.stitchedMatchups)
        .every(
          (matchup) =>
            matchup.week === 17 &&
            matchup.sides.every((side) => side.expectedPoints > 0),
        ),
    ).toBe(true);
  });

  it("records every reviewed score correction with provenance", () => {
    const corrections = seasonManifests.flatMap(
      (manifest) => manifest.corrections,
    );
    expect(corrections).toHaveLength(6);
    for (const correction of corrections) {
      expect(correction.reviewedBy).toBeTruthy();
      expect(Object.keys(correction.patch).length).toBeGreaterThan(0);
    }
    expect(
      corrections.filter((correction) => correction.reason.includes("IR")),
    ).toHaveLength(5);
    expect(
      corrections.find(
        (correction) => correction.id === "2023-week-14-zero-custom-points",
      ),
    ).toMatchObject({
      targetType: "source_week",
      targetId: "995467206685184000:14",
      patch: { usePlatformPoints: true },
    });
  });

  it("never reuses an active provider league across seasons", () => {
    const activeSources = seasonManifests.flatMap((manifest) =>
      manifest.sources
        .filter((source) => source.enabled)
        .map((source) => `${source.provider}:${source.externalId}`),
    );
    expect(new Set(activeSources).size).toBe(activeSources.length);
  });

  it("rejects duplicate and ambiguous overlapping active sources", () => {
    const source = season2025.sources[0];
    expect(() =>
      seasonManifestSchema.parse({
        ...season2025,
        sources: [source, { ...source }],
      }),
    ).toThrow(/duplicate active source/);
    expect(() =>
      seasonManifestSchema.parse({
        ...season2025,
        sources: [source, { ...source, externalId: "other" }],
      }),
    ).toThrow(/need distinct priority or group labels/);
  });

  it("rejects a complete season without reviewed outcomes", () => {
    expect(() =>
      seasonManifestSchema.parse({ ...season2025, outcomes: undefined }),
    ).toThrow(/complete seasons require reviewed outcomes/);
  });
});
