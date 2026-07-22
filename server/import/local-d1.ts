import { createHash, createHmac } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

function miniflareDatabaseFilename(databaseId: string) {
  const key = createHash("sha256")
    .update("miniflare-D1DatabaseObject")
    .digest();
  const nameHmac = createHmac("sha256", key)
    .update(databaseId)
    .digest()
    .subarray(0, 16);
  const hmac = createHmac("sha256", key)
    .update(nameHmac)
    .digest()
    .subarray(0, 16);
  return `${Buffer.concat([nameHmac, hmac]).toString("hex")}.sqlite`;
}

export async function localDatabasePath() {
  const config = await readFile(resolve("wrangler.jsonc"), "utf8");
  const previewId = config.match(
    /"preview_database_id"\s*:\s*"([^"]+)"/,
  )?.[1];
  if (!previewId)
    throw new Error("wrangler.jsonc must define preview_database_id for D1.");

  return resolve(
    ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
    miniflareDatabaseFilename(previewId),
  );
}

export async function findLocalDatabase() {
  const path = await localDatabasePath();
  await access(path);
  const database = new DatabaseSync(path, { readOnly: true });
  const row = database
    .prepare(
      "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='seasons'",
    )
    .get() as { count: number };
  database.close();
  if (row.count !== 1)
    throw new Error(
      "Local preview D1 is not migrated. Run npm run db:migrate:local first.",
    );
  return path;
}
