import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { findLocalDatabase } from "./local-d1";

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
