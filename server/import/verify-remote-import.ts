import { readFile, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface RemoteImportManifest {
  version: number;
  chunks: Array<{
    order: number;
    file: string;
    statementCount: number;
  }>;
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const importDir = resolve(projectRoot, "generated/remote-import");
const rehearsalPath = resolve(importDir, "rehearsal.sqlite");
const expectedCounts = {
  seasons: 14,
  teams: 210,
  people: 23,
  players: 1072,
  matchups: 1668,
  lineups: 45853,
};

await rm(rehearsalPath, { force: true });
const database = new DatabaseSync(rehearsalPath);
try {
  database.exec(
    await readFile(
      resolve(
        projectRoot,
        "server/db/migrations/0000_friendly_tyger_tiger.sql",
      ),
      "utf8",
    ),
  );
  const manifest = JSON.parse(
    await readFile(resolve(importDir, "manifest.json"), "utf8"),
  ) as RemoteImportManifest;
  if (manifest.version !== 1) throw new Error("Unsupported import manifest");
  for (const chunk of manifest.chunks) {
    database.exec(await readFile(resolve(importDir, chunk.file), "utf8"));
  }

  const counts = database
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM seasons) seasons,
        (SELECT COUNT(*) FROM season_teams) teams,
        (SELECT COUNT(*) FROM people) people,
        (SELECT COUNT(*) FROM players) players,
        (SELECT COUNT(*) FROM matchups) matchups,
        (SELECT COUNT(*) FROM lineup_entries) lineups`,
    )
    .get() as Record<keyof typeof expectedCounts, number>;
  for (const [name, expected] of Object.entries(expectedCounts)) {
    if (Number(counts[name as keyof typeof expectedCounts]) !== expected)
      throw new Error(
        `Remote-import rehearsal ${name} mismatch: expected ${expected}, received ${counts[name as keyof typeof expectedCounts]}`,
      );
  }
  const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
  const integrity = database.prepare("PRAGMA integrity_check").get() as {
    integrity_check: string;
  };
  if (foreignKeys.length > 0)
    throw new Error(
      `Remote-import rehearsal has ${foreignKeys.length} foreign-key violations`,
    );
  if (integrity.integrity_check !== "ok")
    throw new Error(
      `Remote-import rehearsal integrity check failed: ${integrity.integrity_check}`,
    );
  const ties = database
    .prepare(
      `SELECT COUNT(DISTINCT m.id) count
       FROM matchups m
       JOIN seasons s ON s.id=m.season_id
       JOIN matchup_teams mt ON mt.matchup_id=m.id
       WHERE s.status='complete' AND m.status IN ('final', 'corrected')
         AND mt.outcome='tie'`,
    )
    .get() as { count: number };
  if (ties.count !== 0)
    throw new Error(
      `Remote-import rehearsal found ${ties.count} canonical tie games`,
    );
  console.log(
    `Remote-import rehearsal passed ${manifest.chunks.length} chunks with canonical counts and zero foreign-key violations.`,
    counts,
  );
} finally {
  database.close();
  await rm(rehearsalPath, { force: true });
}
