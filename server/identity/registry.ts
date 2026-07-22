import { z } from "zod";

import values from "../../config/identity-mappings.json";

const identityMappingSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  preferredName: z.string().min(1),
  yahooGuid: z.string().min(1).optional(),
  sleeperUserId: z.string().regex(/^\d+$/),
  aliases: z.array(z.string().min(1)).min(1),
});

const registrySchema = z
  .object({
    version: z.number().int().positive(),
    reviewedBy: z.string().min(1),
    reviewedAt: z.iso.date(),
    mappings: z.array(identityMappingSchema),
  })
  .superRefine((registry, context) => {
    for (const field of ["slug", "yahooGuid", "sleeperUserId"] as const) {
      const values = registry.mappings
        .map((mapping) => mapping[field])
        .filter((value): value is string => Boolean(value));
      if (new Set(values).size !== values.length)
        context.addIssue({
          code: "custom",
          path: ["mappings"],
          message: `duplicate identity ${field}`,
        });
    }
  });

export const identityRegistry = registrySchema.parse(values);

export function resolveIdentity(
  provider: "yahoo" | "sleeper",
  externalId: string,
  displayName: string,
) {
  const mapping = identityRegistry.mappings.find((candidate) =>
    provider === "yahoo"
      ? candidate.yahooGuid === externalId
      : candidate.sleeperUserId === externalId,
  );
  const canonicalKey = mapping?.yahooGuid
    ? `yahoo:${mapping.yahooGuid}`
    : `sleeper:${mapping?.sleeperUserId ?? externalId}`;
  return mapping
    ? {
        canonicalKey,
        slug: mapping.slug,
        preferredName: mapping.preferredName,
        aliases: [...new Set([...mapping.aliases, displayName])],
        reviewed: true,
      }
    : {
        canonicalKey: `${provider}:${externalId}`,
        slug: null,
        preferredName: displayName,
        aliases: [displayName],
        reviewed: provider === "yahoo",
      };
}
