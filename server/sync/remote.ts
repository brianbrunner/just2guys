import { readFile } from "node:fs/promises";

import { z } from "zod";

import { createD1HttpDatabase } from "../db/http";
import { runScheduledSync } from "./scheduled";

const environmentSchema = z.object({
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_API_TOKEN: z.string().min(1),
});

const environment = environmentSchema.parse(process.env);
const wrangler = await readFile(
  new URL("../../wrangler.jsonc", import.meta.url),
  "utf8",
);
const databaseId = wrangler.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
const activeSeason = wrangler.match(/"ACTIVE_SEASON"\s*:\s*"(\d{4})"/)?.[1];
const staleAfterSeconds = wrangler.match(
  /"STALE_AFTER_SECONDS"\s*:\s*"(\d+)"/,
)?.[1];
if (!databaseId || !activeSeason || !staleAfterSeconds)
  throw new Error(
    "wrangler.jsonc is missing the production sync configuration.",
  );

const DB = createD1HttpDatabase({
  accountId: environment.CLOUDFLARE_ACCOUNT_ID,
  databaseId,
  apiToken: environment.CLOUDFLARE_API_TOKEN,
});
const result = await runScheduledSync(
  {
    DB,
    ACTIVE_SEASON: activeSeason,
    STALE_AFTER_SECONDS: staleAfterSeconds,
  },
  Date.now(),
  "manual",
);
console.log(JSON.stringify({ event: "remote_sync_finished", ...result }));
if (result.status === "failed") process.exitCode = 1;
