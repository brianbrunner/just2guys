import releaseValues from "../../config/release.json";

const urlArgument = process.argv.find((argument) =>
  argument.startsWith("--url="),
);
const configuredUrl = urlArgument
  ? urlArgument.slice("--url=".length)
  : releaseValues.productionUrl;
if (!configuredUrl)
  throw new Error(
    "Provide --url=https://… or record productionUrl in config/release.json",
  );
const origin = new URL(configuredUrl);
if (origin.protocol !== "https:")
  throw new Error("Production verification requires an HTTPS URL");

async function response(path: string) {
  const result = await fetch(new URL(path, origin), {
    headers: {
      Accept: path.startsWith("/api/") ? "application/json" : "text/html",
    },
    redirect: "error",
  });
  if (!result.ok) throw new Error(`${path} returned HTTP ${result.status}`);
  return result;
}

const expectedPages = [
  ["/", "Every season. Every score. All the receipts."],
  ["/seasons", "Season archive"],
  ["/managers", "Managers"],
  ["/records", "Records"],
] as const;
for (const [path, expected] of expectedPages) {
  const body = await (await response(path)).text();
  if (!body.includes(expected))
    throw new Error(`${path} did not contain expected rendered content`);
  console.log(`PASS ${path}: HTTPS SSR content verified.`);
}

const healthResponse = await response("/health");
const health = (await healthResponse.json()) as {
  ok?: boolean;
  activeSeason?: { status?: string } | null;
  lastSuccessfulSync?: { finished_at?: string } | null;
  stale?: boolean;
  degraded?: boolean;
};
if (!health.ok || health.stale || health.degraded)
  throw new Error(`Production health is not OK: ${JSON.stringify(health)}`);
if (
  health.activeSeason?.status === "in_season" &&
  !health.lastSuccessfulSync?.finished_at
)
  throw new Error("In-season production has no successful scheduled sync");
console.log("PASS /health: active season and sync health verified.");

const weekResponse = await response("/api/seasons/2025/weeks/17");
if (!weekResponse.headers.get("etag"))
  throw new Error("Production week JSON response is missing its ETag");
const week = (await weekResponse.json()) as { matchups?: unknown[] };
if (!Array.isArray(week.matchups) || week.matchups.length === 0)
  throw new Error("Production week JSON does not contain seeded matchups");
console.log("PASS week JSON: seeded data and ETag verified.");
console.log(`Production verification passed for ${origin.origin}.`);
