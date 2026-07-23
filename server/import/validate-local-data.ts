import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { findLocalDatabase } from "./local-d1";

const databasePath = await findLocalDatabase();
const database = new DatabaseSync(databasePath, { readOnly: true });
const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
const integrity = database.prepare("PRAGMA integrity_check").get() as {
  integrity_check: string;
};
const unmappedRosters = database
  .prepare(
    `SELECT DISTINCT s.year, sr.external_roster_id
     FROM source_rosters sr
     JOIN season_sources ss ON ss.id=sr.season_source_id
     JOIN seasons s ON s.id=ss.season_id
     JOIN matchup_teams mt ON mt.source_roster_id=sr.id
     WHERE s.status='complete' AND sr.season_team_id IS NULL`,
  )
  .all();
const overfullGames = database
  .prepare(
    `SELECT s.year, m.id, COUNT(mt.id) participants
     FROM matchups m JOIN seasons s ON s.id=m.season_id
     JOIN matchup_teams mt ON mt.matchup_id=m.id
     WHERE s.status='complete' AND m.status <> 'cancelled'
     GROUP BY m.id HAVING COUNT(mt.id) > 2`,
  )
  .all();
const missingManagers = database
  .prepare(
    `SELECT DISTINCT s.year, st.id, st.name
     FROM season_teams st JOIN seasons s ON s.id=st.season_id
     JOIN matchup_teams mt ON mt.season_team_id=st.id
     LEFT JOIN season_team_managers stm ON stm.season_team_id=st.id
     WHERE s.status='complete' AND stm.person_id IS NULL`,
  )
  .all();
const unresolvedAccounts = database
  .prepare(
    `SELECT DISTINCT s.year, pa.provider, pa.external_id, pa.display_name
     FROM provider_accounts pa
     JOIN source_roster_accounts sra ON sra.provider_account_id=pa.id
     JOIN source_rosters sr ON sr.id=sra.source_roster_id
     JOIN season_sources ss ON ss.id=sr.season_source_id
     JOIN seasons s ON s.id=ss.season_id
     WHERE s.status='complete'
       AND (pa.person_id IS NULL OR pa.unresolved_reason IS NOT NULL)`,
  )
  .all();
const invalidOutcomes = database
  .prepare(
    `SELECT s.year, s.team_count,
       SUM(CASE WHEN st.final_place=1 THEN 1 ELSE 0 END) champions,
       SUM(CASE WHEN st.final_place=s.team_count THEN 1 ELSE 0 END) last_places,
       COUNT(st.id) teams
     FROM seasons s LEFT JOIN season_teams st ON st.season_id=s.id
     WHERE s.status='complete' GROUP BY s.id
     HAVING champions <> 1 OR last_places <> 1 OR teams <> s.team_count`,
  )
  .all();
const invalidSides = database
  .prepare(
    `SELECT s.year, m.id, mt.side
     FROM matchup_teams mt JOIN matchups m ON m.id=mt.matchup_id
     JOIN seasons s ON s.id=m.season_id
     WHERE s.status='complete' AND mt.side NOT IN (1, 2)`,
  )
  .all();
const tiedGames = database
  .prepare(
    `SELECT s.year, m.id, m.week, GROUP_CONCAT(mt.points) scores
     FROM matchups m
     JOIN seasons s ON s.id=m.season_id
     JOIN matchup_teams mt ON mt.matchup_id=m.id
     WHERE s.status='complete' AND m.status IN ('final', 'corrected')
     GROUP BY m.id
     HAVING COUNT(mt.id)=2
       AND SUM(CASE WHEN mt.outcome='tie' THEN 1 ELSE 0 END) > 0`,
  )
  .all();
const invalidHistoricalFacts = database
  .prepare(
    `SELECT 'draft_pick_without_team' issue, dp.id
     FROM draft_picks dp WHERE dp.season_team_id IS NULL
     UNION ALL
     SELECT 'transaction_item_without_team', ti.id
     FROM transaction_items ti WHERE ti.season_team_id IS NULL
     UNION ALL
     SELECT 'completed_draft_without_picks', d.id
     FROM drafts d
     WHERE d.status='complete'
       AND NOT EXISTS (SELECT 1 FROM draft_picks dp WHERE dp.draft_id=d.id)
     UNION ALL
     SELECT 'completed_transaction_without_items', lt.id
     FROM league_transactions lt
     WHERE lt.status='complete'
       AND NOT EXISTS (
         SELECT 1 FROM transaction_items ti WHERE ti.transaction_id=lt.id
       )`,
  )
  .all();
const counts = database
  .prepare(
    `SELECT
      (SELECT COUNT(*) FROM seasons) seasons,
      (SELECT COUNT(*) FROM season_teams) teams,
      (SELECT COUNT(*) FROM people) people,
      (SELECT COUNT(*) FROM players) players,
      (SELECT COUNT(*) FROM matchups) matchups,
      (SELECT COUNT(*) FROM lineup_entries) lineups,
      (SELECT COUNT(*) FROM drafts) drafts,
      (SELECT COUNT(*) FROM draft_picks) draftPicks,
      (SELECT COUNT(*) FROM league_transactions) transactions`,
  )
  .get();
database.close();

const checks = {
  foreignKeys,
  unmappedRosters,
  overfullGames,
  missingManagers,
  unresolvedAccounts,
  invalidOutcomes,
  invalidSides,
  tiedGames,
  invalidHistoricalFacts,
};
const issueCount = Object.values(checks).reduce(
  (total, rows) => total + rows.length,
  integrity.integrity_check === "ok" ? 0 : 1,
);
const report = {
  generatedAt: new Date().toISOString(),
  databasePath,
  integrity: integrity.integrity_check,
  counts,
  issueCount,
  checks,
};
const outputDirectory = resolve("generated/canonical-validation");
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(outputDirectory, "report.md"),
  [
    "# Canonical data validation",
    "",
    `Generated: ${report.generatedAt}`,
    `Integrity: ${report.integrity}`,
    `Issues: ${report.issueCount}`,
    "",
    `Counts: ${JSON.stringify(report.counts)}`,
    "",
    ...Object.entries(checks).flatMap(([name, rows]) => [
      `## ${name}`,
      "",
      rows.length ? "```json" : "None.",
      ...(rows.length ? [JSON.stringify(rows, null, 2), "```"] : []),
      "",
    ]),
  ].join("\n"),
  "utf8",
);
if (issueCount)
  throw new Error(`Canonical data validation found ${issueCount} issues.`);
console.log(`Canonical data validation passed for ${databasePath}.`, counts);
