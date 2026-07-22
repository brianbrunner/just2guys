import { z } from "zod";

const weekMapSchema = z.record(
  z.string().regex(/^\d+$/),
  z.number().int().positive(),
);

export const seasonSourceManifestSchema = z
  .object({
    provider: z.enum(["yahoo", "sleeper"]),
    externalId: z.string().min(1),
    role: z.enum(["full", "regular_season", "postseason", "supplemental"]),
    groupLabel: z.string().min(1).optional(),
    sourceWeekStart: z.number().int().positive(),
    sourceWeekEnd: z.number().int().positive(),
    canonicalWeekOffset: z.number().int().default(0),
    weekMap: weekMapSchema.optional(),
    priority: z.number().int().default(0),
    enabled: z.boolean().default(true),
    importMatchups: z.boolean().default(true),
    includeUnpairedMatchups: z.boolean().default(true),
    platformScoreWeeks: z.array(z.number().int().positive()).default([]),
    ignoredReason: z.string().min(1).optional(),
  })
  .superRefine((source, context) => {
    if (source.sourceWeekEnd < source.sourceWeekStart) {
      context.addIssue({
        code: "custom",
        message: "sourceWeekEnd must be at or after sourceWeekStart",
      });
    }
    if (!source.enabled && !source.ignoredReason) {
      context.addIssue({
        code: "custom",
        message: "disabled sources require ignoredReason",
      });
    }
    for (const week of source.platformScoreWeeks) {
      if (week < source.sourceWeekStart || week > source.sourceWeekEnd) {
        context.addIssue({
          code: "custom",
          message: `platformScoreWeeks contains week ${week} outside the source range`,
        });
      }
    }
  });

export const correctionManifestSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  patch: z.record(z.string(), z.unknown()),
  reason: z.string().min(1),
  reviewedBy: z.string().min(1),
  reviewedAt: z.iso.datetime(),
});

const stitchedMatchupSideSchema = z.object({
  sourceExternalRosterId: z.string().regex(/^\d+:\d+$/),
  sourceWeek: z.number().int().positive(),
  expectedPoints: z.number().finite(),
});

const stitchedMatchupSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  week: z.number().int().positive(),
  phase: z.enum(["winners", "consolation", "losers", "placement"]),
  round: z.number().int().positive().nullable().default(null),
  placementLabel: z.string().min(1).optional(),
  sides: z.tuple([stitchedMatchupSideSchema, stitchedMatchupSideSchema]),
});

export const seasonManifestSchema = z
  .object({
    version: z.number().int().positive(),
    year: z.number().int().min(2013).max(2100),
    slug: z.string().regex(/^\d{4}$/),
    name: z.string().min(1),
    status: z.enum([
      "planned",
      "pre_draft",
      "in_season",
      "complete",
      "needs_review",
    ]),
    regularSeasonStartWeek: z.number().int().positive(),
    regularSeasonEndWeek: z.number().int().positive(),
    playoffStartWeek: z.number().int().positive().nullable(),
    finalWeek: z.number().int().positive(),
    teamCount: z.number().int().positive(),
    structure: z.enum(["single", "grouped"]),
    visible: z.boolean().default(true),
    notes: z.string().optional(),
    sources: z.array(seasonSourceManifestSchema).min(1),
    standingsTiebreakers: z
      .array(
        z.enum([
          "wins",
          "ties",
          "points_for",
          "points_against",
          "display_name",
        ]),
      )
      .min(1),
    outcomes: z
      .object({
        championExternalRosterId: z.string().min(1),
        lastPlaceExternalRosterId: z.string().min(1),
      })
      .optional(),
    stitchedMatchups: z.array(stitchedMatchupSchema).default([]),
    rosterMappings: z.record(z.string(), z.string()).default({}),
    corrections: z.array(correctionManifestSchema).default([]),
    review: z.object({
      status: z.enum(["reviewed", "needs_review"]),
      reviewedBy: z.string().min(1).optional(),
      reviewedAt: z.iso.date().optional(),
      notes: z.string().optional(),
    }),
  })
  .superRefine((manifest, context) => {
    if (manifest.slug !== String(manifest.year)) {
      context.addIssue({
        code: "custom",
        path: ["slug"],
        message: "slug must match year",
      });
    }
    if (
      manifest.regularSeasonStartWeek > manifest.regularSeasonEndWeek ||
      manifest.regularSeasonEndWeek > manifest.finalWeek
    ) {
      context.addIssue({
        code: "custom",
        message: "canonical week boundaries are out of order",
      });
    }
    if (manifest.status === "complete" && !manifest.outcomes) {
      context.addIssue({
        code: "custom",
        path: ["outcomes"],
        message: "complete seasons require reviewed outcomes",
      });
    }
    if (
      manifest.status === "complete" &&
      manifest.review.status !== "reviewed"
    ) {
      context.addIssue({
        code: "custom",
        path: ["review"],
        message: "complete seasons must be reviewed",
      });
    }
    const stitchedIds = new Set<string>();
    for (const matchup of manifest.stitchedMatchups) {
      if (stitchedIds.has(matchup.id)) {
        context.addIssue({
          code: "custom",
          path: ["stitchedMatchups"],
          message: `duplicate stitched matchup ${matchup.id}`,
        });
      }
      stitchedIds.add(matchup.id);
      if (matchup.week > manifest.finalWeek) {
        context.addIssue({
          code: "custom",
          path: ["stitchedMatchups"],
          message: `stitched matchup ${matchup.id} is after the season's final week`,
        });
      }
      if (
        matchup.sides[0].sourceExternalRosterId ===
        matchup.sides[1].sourceExternalRosterId
      ) {
        context.addIssue({
          code: "custom",
          path: ["stitchedMatchups"],
          message: `stitched matchup ${matchup.id} repeats a source roster`,
        });
      }
    }
    const activeSources = manifest.sources.filter((source) => source.enabled);
    const ids = new Set<string>();
    for (const source of activeSources) {
      const key = `${source.provider}:${source.externalId}`;
      if (ids.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["sources"],
          message: `duplicate active source ${key}`,
        });
      }
      ids.add(key);
    }
    for (let index = 0; index < activeSources.length; index += 1) {
      for (
        let otherIndex = index + 1;
        otherIndex < activeSources.length;
        otherIndex += 1
      ) {
        const left = activeSources[index];
        const right = activeSources[otherIndex];
        const overlaps =
          left.sourceWeekStart <= right.sourceWeekEnd &&
          right.sourceWeekStart <= left.sourceWeekEnd;
        if (
          overlaps &&
          left.priority === right.priority &&
          left.groupLabel === right.groupLabel
        ) {
          context.addIssue({
            code: "custom",
            path: ["sources"],
            message: `overlapping sources ${left.externalId} and ${right.externalId} need distinct priority or group labels`,
          });
        }
      }
    }
  });

export type SeasonManifest = z.infer<typeof seasonManifestSchema>;

export function validateManifestSet(values: unknown[]): SeasonManifest[] {
  const manifests = values.map((value) => seasonManifestSchema.parse(value));
  const years = new Set<number>();
  const sourceIds = new Set<string>();
  for (const manifest of manifests) {
    if (years.has(manifest.year))
      throw new Error(`Duplicate manifest year ${manifest.year}`);
    years.add(manifest.year);
    for (const source of manifest.sources.filter(
      (candidate) => candidate.enabled,
    )) {
      const sourceKey = `${source.provider}:${source.externalId}`;
      if (sourceIds.has(sourceKey))
        throw new Error(`Active source reused across seasons: ${sourceKey}`);
      sourceIds.add(sourceKey);
    }
  }
  return manifests.sort((left, right) => left.year - right.year);
}
