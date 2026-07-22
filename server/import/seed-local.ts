import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

async function findLocalDatabase() {
  const directory = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  const entries = await readdir(directory, { withFileTypes: true });
  const candidates = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".sqlite") &&
        entry.name !== "metadata.sqlite",
    )
    .map((entry) => resolve(directory, entry.name));
  const initialized = candidates.filter((path) => {
    const database = new DatabaseSync(path, { readOnly: true });
    const row = database
      .prepare(
        "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='seasons'",
      )
      .get() as { count: number };
    database.close();
    return row.count === 1;
  });
  if (initialized.length !== 1) {
    throw new Error(
      `Expected exactly one migrated local D1 database, found ${initialized.length}. Run npm run db:migrate:local first.`,
    );
  }
  return initialized[0];
}

const databasePath = await findLocalDatabase();
const [legacySql, sleeperSql] = await Promise.all([
  readFile(resolve("generated/legacy-import/legacy-import.sql"), "utf8"),
  readFile(resolve("generated/sleeper-backfill/sleeper-import.sql"), "utf8"),
]);
const database = new DatabaseSync(databasePath);
database.exec(legacySql);
database.exec(sleeperSql);
database.exec("DELETE FROM derived_results;");
const violations = database.prepare("PRAGMA foreign_key_check").all();
if (violations.length) {
  database.close();
  throw new Error(
    `Local seed produced ${violations.length} foreign-key violations.`,
  );
}
const counts = database
  .prepare(
    `SELECT
       (SELECT COUNT(*) FROM seasons) seasons,
       (SELECT COUNT(*) FROM season_teams) teams,
       (SELECT COUNT(*) FROM matchups) matchups,
       (SELECT COUNT(*) FROM lineup_entries) lineups`,
  )
  .get();
database.close();
console.log(`Seeded local D1 at ${databasePath}.`, counts);
