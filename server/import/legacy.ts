import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { seasonManifests } from "../manifests/registry";
import { safeImageUrl } from "../security/image-url";
import { resolveIdentity } from "../identity/registry";

type Row = Record<string, string | number | null>;

const canonicalLeagueKeys = new Map([
  [2013, "314.l.818997"],
  [2014, "331.l.721731"],
  [2015, "348.l.1060011"],
  [2016, "359.l.854870"],
  [2017, "371.l.683479"],
  [2018, "380.l.906329"],
  [2019, "390.l.1123131"],
  [2020, "399.l.1026513"],
]);

const expectedChecksum =
  "6c44d98b65be5a5e22505132b22727abbfe46a45516518b7486ae9941e70ffce";

function stableId(prefix: string, value: string | number) {
  return `${prefix}-${createHash("sha256").update(String(value)).digest("hex").slice(0, 20)}`;
}

function slugify(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "unknown"
  );
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return `'${serialized.replaceAll("'", "''")}'`;
}

function insert(
  table: string,
  values: Record<string, unknown>,
  conflictColumns: string[],
  updateColumns: string[],
) {
  const columns = Object.keys(values);
  const conflict = conflictColumns.map((column) => `"${column}"`).join(", ");
  const updates = updateColumns
    .map((column) => `"${column}" = excluded."${column}"`)
    .join(", ");
  return `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${columns.map((column) => sqlValue(values[column])).join(", ")}) ON CONFLICT (${conflict}) DO ${updates ? `UPDATE SET ${updates}` : "NOTHING"};`;
}

function sourceExternalIdFromTeamKey(key: string) {
  return key.split(".t.")[0] ?? key;
}

function classification(slot: string): "starter" | "bench" | "ir" {
  if (slot === "BN") return "bench";
  if (slot === "IR" || slot === "IR+") return "ir";
  return "starter";
}

function phase(row: Row, regularEnd: number) {
  if (Number(row.week) <= regularEnd) return "regular";
  if (Number(row.is_playoffs)) return "winners";
  if (Number(row.is_consolation)) return "consolation";
  if (Number(row.is_losers)) return "losers";
  return "placement";
}

async function checksum(path: string) {
  const { readFile } = await import("node:fs/promises");
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

function all(
  database: DatabaseSync,
  query: string,
  ...params: (string | number)[]
): Row[] {
  return database.prepare(query).all(...params) as Row[];
}

async function main() {
  const inputPath = resolve(process.argv[2] ?? "migration-input/football.db");
  const outputDir = resolve(process.argv[3] ?? "generated/legacy-import");
  const actualChecksum = await checksum(inputPath);
  if (actualChecksum !== expectedChecksum) {
    throw new Error(
      `Legacy input checksum mismatch. Expected ${expectedChecksum}, received ${actualChecksum}.`,
    );
  }

  const database = new DatabaseSync(inputPath, { readOnly: true });
  database.exec("PRAGMA query_only = ON");
  const integrity = database.prepare("PRAGMA integrity_check").get() as {
    integrity_check: string;
  };
  if (integrity.integrity_check !== "ok")
    throw new Error(
      `Legacy SQLite integrity check failed: ${integrity.integrity_check}`,
    );

  const statements: string[] = [
    "PRAGMA foreign_keys = ON;",
    "BEGIN IMMEDIATE;",
  ];
  const report = {
    runId: randomUUID(),
    generatedAt: new Date().toISOString(),
    source: {
      path: inputPath,
      sha256: actualChecksum,
      openedReadOnly: true,
      integrity: "ok",
    },
    seasons: [] as Record<string, unknown>[],
    totals: {
      teams: 0,
      uniqueManagers: 0,
      uniquePlayers: 0,
      matchups: 0,
      lineupEntries: 0,
      ignoredByeComparisons: 0,
      appliedCorrections: 0,
      discrepancies: 0,
    },
  };
  const allManagerIds = new Set<string>();
  const allPlayerIds = new Set<string>();

  for (const manifest of seasonManifests.filter(
    (candidate) => candidate.year <= 2020,
  )) {
    const seasonId = `season-${manifest.year}`;
    statements.push(
      insert(
        "seasons",
        {
          id: seasonId,
          year: manifest.year,
          slug: manifest.slug,
          name: manifest.name,
          status: manifest.status,
          regular_season_start_week: manifest.regularSeasonStartWeek,
          regular_season_end_week: manifest.regularSeasonEndWeek,
          playoff_start_week: manifest.playoffStartWeek,
          final_week: manifest.finalWeek,
          team_count: manifest.teamCount,
          structure: manifest.structure,
          visible: manifest.visible,
          manifest_version: manifest.version,
          notes: manifest.notes ?? null,
        },
        ["id"],
        ["name", "status", "visible", "manifest_version", "notes"],
      ),
    );
    for (const source of manifest.sources) {
      const sourceId = stableId(
        "source",
        `${source.provider}:${source.externalId}`,
      );
      statements.push(
        insert(
          "season_sources",
          {
            id: sourceId,
            season_id: seasonId,
            provider: source.provider,
            external_id: source.externalId,
            role: source.role,
            group_label: source.groupLabel ?? null,
            source_week_start: source.sourceWeekStart,
            source_week_end: source.sourceWeekEnd,
            canonical_week_offset: source.canonicalWeekOffset,
            week_map_json: source.weekMap
              ? JSON.stringify(source.weekMap)
              : null,
            priority: source.priority,
            enabled: source.enabled,
            ignored_reason: source.ignoredReason ?? null,
          },
          ["provider", "external_id"],
          [
            "season_id",
            "role",
            "group_label",
            "priority",
            "enabled",
            "ignored_reason",
          ],
        ),
      );
    }
    for (const correction of manifest.corrections) {
      statements.push(
        insert(
          "corrections",
          {
            id: correction.id,
            season_id: seasonId,
            kind: correction.kind,
            target_type: correction.targetType,
            target_id: correction.targetId,
            patch_json: JSON.stringify(correction.patch),
            reason: correction.reason,
            reviewed_by: correction.reviewedBy,
            reviewed_at: correction.reviewedAt,
            applied_at: report.generatedAt,
          },
          ["id"],
          ["patch_json", "reason", "reviewed_by", "reviewed_at", "applied_at"],
        ),
      );
    }
  }

  for (const [year, leagueKey] of canonicalLeagueKeys) {
    const manifest = seasonManifests.find(
      (candidate) => candidate.year === year,
    );
    if (!manifest) throw new Error(`Missing manifest ${year}`);
    const seasonId = `season-${year}`;
    const league = database
      .prepare("SELECT id FROM league WHERE key = ?")
      .get(leagueKey) as { id: number } | undefined;
    if (!league) throw new Error(`Legacy league ${leagueKey} not found`);

    const teams = all(
      database,
      "SELECT * FROM team WHERE league_id = ? ORDER BY id",
      league.id,
    );
    const managerRows = all(
      database,
      `SELECT DISTINCT manager.id, manager._id, manager.nickname
       FROM manager
       JOIN team_manager_through tm ON tm.manager_id = manager.id
       JOIN team ON team.id = tm.team_id
       WHERE team.league_id = ? ORDER BY manager.id`,
      league.id,
    );
    const teamManagerRows = all(
      database,
      `SELECT tm.team_id, manager.id manager_id, manager._id external_id, manager.nickname
       FROM team_manager_through tm
       JOIN manager ON manager.id = tm.manager_id
       JOIN team ON team.id = tm.team_id
       WHERE team.league_id = ? ORDER BY tm.team_id, manager.id`,
      league.id,
    );
    const matchupRows = all(
      database,
      "SELECT * FROM matchup WHERE league_id = ? ORDER BY week, id",
      league.id,
    );
    const lineupRows = all(
      database,
      `SELECT rs.*, player._id player_external_id, player.name player_name,
              player.display_position, player.position_type, player.image_url, player.sleeper_id
       FROM matchuprosterslot rs
       JOIN player ON player.id = rs.player_id
       JOIN matchup ON matchup.id = rs.matchup_id
       WHERE matchup.league_id = ? ORDER BY rs.matchup_id, rs.team_id, rs.id`,
      league.id,
    );

    const teamIds = new Map<number, string>();
    const teamKeys = new Map<number, string>();
    for (const team of teams) {
      const teamKey = String(team.key);
      const id = stableId("team", `${year}:${teamKey}`);
      teamIds.set(Number(team.id), id);
      teamKeys.set(Number(team.id), teamKey);
      const isChampion =
        manifest.outcomes?.championExternalRosterId === teamKey;
      const isLast = manifest.outcomes?.lastPlaceExternalRosterId === teamKey;
      statements.push(
        insert(
          "season_teams",
          {
            id,
            season_id: seasonId,
            slug: `${slugify(String(team.name))}-${createHash("sha1").update(teamKey).digest("hex").slice(0, 6)}`,
            name: team.name,
            logo_url: safeImageUrl(String(team.logo || "")),
            group_label: team.group || null,
            playoff_seed: team.playoff_seed,
            final_place: isChampion ? 1 : isLast ? manifest.teamCount : null,
          },
          ["id"],
          ["name", "logo_url", "group_label", "playoff_seed", "final_place"],
        ),
      );
      const sourceExternalId = sourceExternalIdFromTeamKey(teamKey);
      const sourceId = stableId("source", `yahoo:${sourceExternalId}`);
      statements.push(
        insert(
          "source_rosters",
          {
            id: stableId("roster", `yahoo:${teamKey}`),
            season_source_id: sourceId,
            external_roster_id: teamKey,
            season_team_id: id,
            name_snapshot: team.name,
            logo_url_snapshot: safeImageUrl(String(team.logo || "")),
            metadata_json: JSON.stringify({
              legacyId: team.id,
              group: team.group || null,
            }),
          },
          ["season_source_id", "external_roster_id"],
          [
            "season_team_id",
            "name_snapshot",
            "logo_url_snapshot",
            "metadata_json",
          ],
        ),
      );
    }

    const managerIds = new Map<
      number,
      { personId: string; accountId: string }
    >();
    for (const manager of managerRows) {
      const externalId = String(manager._id);
      const displayName = String(manager.nickname);
      const identity = resolveIdentity("yahoo", externalId, displayName);
      const personId = stableId("person", identity.canonicalKey);
      const accountId = stableId("account", `yahoo:${externalId}`);
      managerIds.set(Number(manager.id), { personId, accountId });
      statements.push(
        insert(
          "people",
          {
            id: personId,
            slug:
              identity.slug ??
              `${slugify(displayName)}-${createHash("sha1").update(externalId).digest("hex").slice(0, 6)}`,
            preferred_name: identity.preferredName,
            aliases_json: JSON.stringify(identity.aliases),
          },
          ["id"],
          ["slug", "preferred_name", "aliases_json"],
        ),
        insert(
          "provider_accounts",
          {
            id: accountId,
            provider: "yahoo",
            external_id: externalId,
            person_id: personId,
            display_name: displayName,
            unresolved_reason: null,
          },
          ["provider", "external_id"],
          ["person_id", "display_name", "unresolved_reason"],
        ),
      );
    }

    for (const relation of teamManagerRows) {
      const ids = managerIds.get(Number(relation.manager_id));
      const seasonTeamId = teamIds.get(Number(relation.team_id));
      if (!ids || !seasonTeamId)
        throw new Error(`Broken team/manager relation in ${year}`);
      const sourceRosterId = stableId(
        "roster",
        `yahoo:${teamKeys.get(Number(relation.team_id))}`,
      );
      statements.push(
        insert(
          "season_team_managers",
          {
            season_team_id: seasonTeamId,
            person_id: ids.personId,
            role: "manager",
          },
          ["season_team_id", "person_id"],
          ["role"],
        ),
        insert(
          "source_roster_accounts",
          {
            source_roster_id: sourceRosterId,
            provider_account_id: ids.accountId,
            role: "owner",
          },
          ["source_roster_id", "provider_account_id"],
          ["role"],
        ),
      );
    }

    const matchupTeamIds = new Map<string, string>();
    const pointCorrections = new Map(
      manifest.corrections
        .filter((correction) => correction.kind === "matchup_team_points")
        .map((correction) => [
          correction.targetId,
          Number(correction.patch.points),
        ]),
    );
    const matchupReport = {
      regular: 0,
      winners: 0,
      consolation: 0,
      losers: 0,
      placement: 0,
      byes: 0,
    };
    for (const matchup of matchupRows) {
      const matchupId = stableId("matchup", `yahoo:${matchup.key}`);
      const matchupPhase = phase(
        matchup,
        manifest.regularSeasonEndWeek,
      ) as keyof typeof matchupReport;
      matchupReport[matchupPhase] += 1;
      const hasOpponent = matchup.team_b_id !== null;
      if (!hasOpponent || Number(matchup.is_bye)) matchupReport.byes += 1;
      const winnerKey =
        matchup.winner_team_key === null
          ? null
          : String(matchup.winner_team_key);
      const sourceExternalId =
        String(matchup.key).match(/^\d+\.l\.\d+/)?.[0] ?? leagueKey;
      const isCorrected = [...pointCorrections.keys()].some((target) =>
        target.startsWith(`${String(matchup.key)}:`),
      );
      statements.push(
        insert(
          "matchups",
          {
            id: matchupId,
            season_id: seasonId,
            season_source_id: stableId("source", `yahoo:${sourceExternalId}`),
            external_id: matchup.key,
            week: matchup.week,
            phase: matchupPhase,
            round:
              Number(matchup.week) -
              (manifest.playoffStartWeek ?? manifest.finalWeek) +
              1,
            sequence: matchup.bracket_order,
            status:
              !hasOpponent || Number(matchup.is_bye)
                ? "bye"
                : isCorrected
                  ? "corrected"
                  : "final",
            bracket_order: matchup.bracket_order,
            corrected: isCorrected,
            finalized_at: `${year}-12-31T00:00:00.000Z`,
          },
          ["season_source_id", "external_id"],
          ["week", "phase", "status", "bracket_order"],
        ),
      );

      for (const side of [1, 2] as const) {
        const legacyTeamId = matchup[side === 1 ? "team_a_id" : "team_b_id"];
        if (legacyTeamId === null) continue;
        const teamId = teamIds.get(Number(legacyTeamId));
        const teamKey = teamKeys.get(Number(legacyTeamId));
        if (!teamId || !teamKey)
          throw new Error(
            `Unknown team ${String(legacyTeamId)} in matchup ${String(matchup.id)}`,
          );
        const sourcePoints = Number(
          matchup[side === 1 ? "team_a_points" : "team_b_points"] ?? 0,
        );
        const points =
          pointCorrections.get(`${String(matchup.key)}:${teamKey}`) ??
          sourcePoints;
        let outcome: "win" | "loss" | "tie" | "bye" | "pending" = "pending";
        if (!hasOpponent || Number(matchup.is_bye)) outcome = "bye";
        else if (winnerKey === "") outcome = "tie";
        else if (winnerKey !== null)
          outcome = winnerKey === teamKey ? "win" : "loss";
        const matchupTeamId = stableId("matchup-team", `${matchupId}:${side}`);
        matchupTeamIds.set(`${matchup.id}:${legacyTeamId}`, matchupTeamId);
        statements.push(
          insert(
            "matchup_teams",
            {
              id: matchupTeamId,
              matchup_id: matchupId,
              season_team_id: teamId,
              source_roster_id: stableId("roster", `yahoo:${teamKey}`),
              side,
              points,
              projected_points:
                matchup[
                  side === 1
                    ? "team_a_projected_points"
                    : "team_b_projected_points"
                ],
              outcome,
              entering_seed: null,
            },
            ["matchup_id", "side"],
            ["points", "projected_points", "outcome"],
          ),
        );
      }
    }

    const playerIds = new Map<string, string>();
    const slotPositions = new Map<string, number>();
    const starterSums = new Map<string, number>();
    for (const slot of lineupRows) {
      const playerExternalId = String(slot.player_external_id);
      const sleeperExternalId = slot.sleeper_id
        ? String(slot.sleeper_id)
        : null;
      const playerId = stableId(
        "player",
        sleeperExternalId
          ? `sleeper:${sleeperExternalId}`
          : `yahoo:${playerExternalId}`,
      );
      if (!playerIds.has(playerExternalId)) {
        playerIds.set(playerExternalId, playerId);
        const isDefense =
          String(slot.position_type).toUpperCase() === "DT" ||
          String(slot.display_position).toUpperCase() === "DEF";
        statements.push(
          insert(
            "players",
            {
              id: playerId,
              name: slot.player_name,
              position: slot.display_position,
              image_url: safeImageUrl(String(slot.image_url || "")),
              is_defense: isDefense,
              active: false,
            },
            ["id"],
            ["name", "position", "image_url", "is_defense"],
          ),
          insert(
            "provider_players",
            {
              id: stableId("provider-player", `yahoo:${playerExternalId}`),
              provider: "yahoo",
              external_id: playerExternalId,
              player_id: playerId,
              metadata_json: slot.sleeper_id
                ? JSON.stringify({ legacySleeperId: slot.sleeper_id })
                : null,
            },
            ["provider", "external_id"],
            ["player_id", "metadata_json"],
          ),
          ...(sleeperExternalId
            ? [
                insert(
                  "provider_players",
                  {
                    id: stableId(
                      "provider-player",
                      `sleeper:${sleeperExternalId}`,
                    ),
                    provider: "sleeper",
                    external_id: sleeperExternalId,
                    player_id: playerId,
                    metadata_json: JSON.stringify({
                      source: "reviewed legacy crosswalk",
                    }),
                  },
                  ["provider", "external_id"],
                  ["player_id", "metadata_json"],
                ),
              ]
            : []),
        );
      }
      const matchupTeamId = matchupTeamIds.get(
        `${slot.matchup_id}:${slot.team_id}`,
      );
      if (!matchupTeamId)
        throw new Error(`Lineup slot ${String(slot.id)} has no matchup team`);
      const positionKey = `${slot.matchup_id}:${slot.team_id}`;
      const order = slotPositions.get(positionKey) ?? 0;
      slotPositions.set(positionKey, order + 1);
      if (classification(String(slot.position)) === "starter") {
        starterSums.set(
          positionKey,
          (starterSums.get(positionKey) ?? 0) + Number(slot.points),
        );
      }
      statements.push(
        insert(
          "lineup_entries",
          {
            id: stableId("lineup", `yahoo:${slot.id}`),
            matchup_team_id: matchupTeamId,
            player_id: playerId,
            slot: slot.position,
            classification: classification(String(slot.position)),
            slot_order: order,
            points: slot.points,
            projected_points: null,
            observed_at: `${year}-12-31T00:00:00.000Z`,
          },
          ["id"],
          [
            "matchup_team_id",
            "player_id",
            "slot",
            "classification",
            "slot_order",
            "points",
          ],
        ),
      );
    }

    const discrepancies: Record<string, unknown>[] = [];
    for (const matchup of matchupRows) {
      if (matchup.team_b_id === null || Number(matchup.is_bye)) {
        report.totals.ignoredByeComparisons += 1;
        continue;
      }
      for (const [legacyTeamId, platformPoints] of [
        [matchup.team_a_id, matchup.team_a_points],
        [matchup.team_b_id, matchup.team_b_points],
      ]) {
        if (legacyTeamId === null || platformPoints === null) continue;
        const key = `${matchup.id}:${legacyTeamId}`;
        if (!starterSums.has(key)) continue;
        const lineupPoints = starterSums.get(key) ?? 0;
        const teamKey = teamKeys.get(Number(legacyTeamId));
        const correctedPoints =
          pointCorrections.get(`${String(matchup.key)}:${String(teamKey)}`) ??
          Number(platformPoints);
        const difference =
          Math.round((correctedPoints - lineupPoints) * 100) / 100;
        if (Math.abs(difference) >= 0.01) {
          discrepancies.push({
            matchupKey: matchup.key,
            teamKey,
            sourcePoints: platformPoints,
            authoritativePoints: correctedPoints,
            lineupPoints: Math.round(lineupPoints * 100) / 100,
            difference,
          });
        }
      }
    }

    const seasonReport = {
      year,
      sources: manifest.sources.map((source) => source.externalId),
      teams: teams.length,
      managers: managerRows.length,
      players: playerIds.size,
      matchups: matchupRows.length,
      matchupsByPhase: matchupReport,
      lineupEntries: lineupRows.length,
      championExternalRosterId: manifest.outcomes?.championExternalRosterId,
      lastPlaceExternalRosterId: manifest.outcomes?.lastPlaceExternalRosterId,
      unresolvedIdentities: 0,
      scoreLineupDiscrepancies: discrepancies,
      appliedCorrections: manifest.corrections,
    };
    report.seasons.push(seasonReport);
    report.totals.teams += teams.length;
    for (const manager of managerRows) allManagerIds.add(String(manager._id));
    for (const playerId of playerIds.keys()) allPlayerIds.add(playerId);
    report.totals.matchups += matchupRows.length;
    report.totals.lineupEntries += lineupRows.length;
    report.totals.appliedCorrections += manifest.corrections.length;
    report.totals.discrepancies += discrepancies.length;
  }
  report.totals.uniqueManagers = allManagerIds.size;
  report.totals.uniquePlayers = allPlayerIds.size;

  statements.push(
    insert(
      "sync_runs",
      {
        id: stableId("sync", `legacy:${expectedChecksum}`),
        trigger: "migration",
        status: "success",
        started_at: report.generatedAt,
        finished_at: report.generatedAt,
        read_count: report.totals.lineupEntries,
        write_count: statements.length,
        upstream_request_count: 0,
        metadata_json: JSON.stringify({
          sourceSha256: expectedChecksum,
          seasons: [...canonicalLeagueKeys.keys()],
        }),
      },
      ["id"],
      ["status", "finished_at", "read_count", "write_count", "metadata_json"],
    ),
    "COMMIT;",
  );

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    resolve(outputDir, "legacy-import.sql"),
    `${statements.join("\n")}\n`,
    "utf8",
  );
  await writeFile(
    resolve(outputDir, "reconciliation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  const markdown = [
    "# Legacy migration reconciliation",
    "",
    `Generated: ${report.generatedAt}`,
    `Source SHA-256: \`${actualChecksum}\` (opened read-only; integrity check passed)`,
    "",
    "| Season | Teams | Managers | Matchups | Lineup entries | Discrepancies |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...report.seasons.map(
      (season) =>
        `| ${String(season.year)} | ${String(season.teams)} | ${String(season.managers)} | ${String(season.matchups)} | ${String(season.lineupEntries)} | ${(season.scoreLineupDiscrepancies as unknown[]).length} |`,
    ),
    "",
    "Provider matchup totals remain authoritative. Five synthetic playoff totals created by the legacy merger are corrected from reviewed manifests because that merger incorrectly counted IR points. Bye placeholders are excluded from score reconciliation.",
    "",
  ].join("\n");
  await writeFile(resolve(outputDir, "reconciliation.md"), markdown, "utf8");
  database.close();
  console.log(
    `Generated ${statements.length} idempotent statements and reconciliation reports in ${outputDir}.`,
  );
}

await main();
