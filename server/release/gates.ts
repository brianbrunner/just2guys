export interface ReleaseGate {
  id: string;
  status: "pass" | "blocked";
  message: string;
}

export interface ReleaseGateInput {
  d1Configured: boolean;
  reviewYears: number[];
  unresolvedAccounts: string[];
  legacyYahooCredentialRevoked: boolean;
  legacySleeperCredentialRevoked: boolean;
  productionSyncPathConfirmed: boolean;
  productionUrl: string | null;
  requireProductionUrl: boolean;
  activeSeasonConfigured: boolean;
}

export function evaluateReleaseGates(input: ReleaseGateInput): ReleaseGate[] {
  const result = (
    id: string,
    pass: boolean,
    success: string,
    failure: string,
  ): ReleaseGate => ({
    id,
    status: pass ? "pass" : "blocked",
    message: pass ? success : failure,
  });
  return [
    result(
      "production-d1",
      input.d1Configured,
      "Production D1 ID is configured.",
      "Replace REPLACE_WITH_PRODUCTION_D1_ID in wrangler.jsonc.",
    ),
    result(
      "historical-review",
      input.reviewYears.length === 0,
      "All historical seasons are reviewed.",
      `Resolve review-gated historical seasons: ${input.reviewYears.join(", ")}.`,
    ),
    result(
      "manager-identities",
      input.unresolvedAccounts.length === 0,
      "Every participating provider account has a reviewed identity.",
      `Resolve participating provider accounts: ${input.unresolvedAccounts.join(", ")}.`,
    ),
    result(
      "legacy-yahoo-credential",
      input.legacyYahooCredentialRevoked,
      "Legacy Yahoo credential revocation is acknowledged.",
      "Revoke the legacy Yahoo credential, then acknowledge it in config/release.json.",
    ),
    result(
      "legacy-sleeper-credential",
      input.legacySleeperCredentialRevoked,
      "Legacy Sleeper credential revocation is acknowledged.",
      "Revoke the expired legacy Sleeper credential, then acknowledge it in config/release.json.",
    ),
    result(
      "production-sync",
      input.productionSyncPathConfirmed,
      "A working production Sleeper sync path is confirmed.",
      "Confirm Worker egress or enable and verify the GitHub/local D1 sync fallback, then acknowledge it in config/release.json.",
    ),
    result(
      "production-url",
      !input.requireProductionUrl ||
        Boolean(input.productionUrl?.startsWith("https://")),
      input.requireProductionUrl
        ? "An HTTPS production URL is recorded."
        : "Production URL verification is deferred until after deployment.",
      "Record the HTTPS production URL in config/release.json.",
    ),
    result(
      "active-season",
      input.activeSeasonConfigured,
      "The active season has an enabled Sleeper source.",
      "Configure the active season with at least one enabled Sleeper source.",
    ),
  ];
}
