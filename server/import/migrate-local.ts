import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { localDatabasePath } from "./local-d1";

const databasePath = await localDatabasePath();
await mkdir(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys=OFF;
  CREATE TABLE IF NOT EXISTS _j2g_local_migrations (
    name TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );
`);
const migrationsDirectory = resolve("server/db/migrations");
const migrations = (await readdir(migrationsDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
for (const name of migrations) {
  const applied = database
    .prepare("SELECT 1 found FROM _j2g_local_migrations WHERE name=?")
    .get(name);
  if (applied) continue;
  const sql = await readFile(resolve(migrationsDirectory, name), "utf8");
  database.exec("BEGIN;");
  try {
    database.exec(sql);
    database
      .prepare("INSERT INTO _j2g_local_migrations (name) VALUES (?)")
      .run(name);
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    database.close();
    throw error;
  }
}
database.exec("PRAGMA foreign_keys=ON;");
database.close();
console.log(`Migrated local preview D1 at ${databasePath}.`);
