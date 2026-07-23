import { createHash } from "node:crypto";

import type { SeasonManifest } from "../manifests/schema";
import { safeImageUrl } from "../security/image-url";
import { resolveIdentity } from "../identity/registry";
import {
  adaptSleeperWeek,
  sleeperOutcome,
  sleeperPoints,
} from "../sleeper/adapter";
import type {
  SleeperBracketMatch,
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperMatchup,
  SleeperPlayer,
  SleeperRoster,
  SleeperTransaction,
  SleeperUser,
} from "../sleeper/schemas";

export interface SleeperDraftSnapshot {
  draft: SleeperDraft;
  picks: SleeperDraftPick[];
}

export interface SleeperSnapshot {
  year: number;
  configured: SeasonManifest["sources"][number];
  league: SleeperLeague;
  users: SleeperUser[];
  rosters: SleeperRoster[];
  winnersBracket: SleeperBracketMatch[];
  losersBracket: SleeperBracketMatch[];
  weeks: { week: number; matchups: SleeperMatchup[] }[];
  drafts?: SleeperDraftSnapshot[];
  transactions?: SleeperTransaction[];
  contentHash: string;
}

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

function teamName(user: SleeperUser | undefined, roster: SleeperRoster) {
  return (
    user?.metadata?.team_name ||
    user?.display_name ||
    `Roster ${roster.roster_id}`
  );
}

function playerName(playerId: string, player?: SleeperPlayer) {
  return (
    player?.full_name ||
    [player?.first_name, player?.last_name].filter(Boolean).join(" ") ||
    `${playerId} Defense`
  );
}

function appendPlayerStatements(
  statements: string[],
  playerId: string,
  player: SleeperPlayer | undefined,
) {
  const position =
    player?.position || (playerId.length <= 3 ? "DEF" : "UNKNOWN");
  const isDefense = position === "DEF" || /^[A-Z]{2,3}$/.test(playerId);
  const playerCanonicalId = stableId("player", `sleeper:${playerId}`);
  statements.push(
    insert(
      "players",
      {
        id: playerCanonicalId,
        name: playerName(playerId, player),
        position,
        nfl_team: player?.team ?? (isDefense ? playerId : null),
        image_url: isDefense
          ? null
          : safeImageUrl(
              `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
            ),
        is_defense: isDefense,
        active: player?.active ?? false,
      },
      ["id"],
      ["name", "position", "nfl_team", "image_url", "is_defense", "active"],
    ),
    insert(
      "provider_players",
      {
        id: stableId("provider-player", `sleeper:${playerId}`),
        provider: "sleeper",
        external_id: playerId,
        player_id: playerCanonicalId,
        metadata_json: null,
      },
      ["provider", "external_id"],
      ["player_id"],
    ),
  );
  return playerCanonicalId;
}

function appendLineupStatements(input: {
  statements: string[];
  side: SleeperMatchup;
  roster: SleeperRoster | undefined;
  snapshot: SleeperSnapshot;
  players: Record<string, SleeperPlayer>;
  generatedAt: string;
  matchupTeamId: string;
  lineupKey: string;
}) {
  const starters = new Map(
    input.side.starters
      .filter((playerId) => playerId !== "0")
      .map((playerId, index) => [playerId, index]),
  );
  const reserve = new Set(input.roster?.reserve ?? []);
  const taxi = new Set(input.roster?.taxi ?? []);
  const starterSlots = input.snapshot.league.roster_positions.filter(
    (slot) => !["BN", "IR", "TAXI"].includes(slot),
  );
  const orderedPlayers = [
    ...input.side.starters,
    ...input.side.players.filter((playerId) => !starters.has(playerId)),
  ].filter(
    (playerId, index, values) =>
      playerId !== "0" && values.indexOf(playerId) === index,
  );
  for (const [slotOrder, playerId] of orderedPlayers.entries()) {
    const player = input.players[playerId];
    const position =
      player?.position || (playerId.length <= 3 ? "DEF" : "UNKNOWN");
    const playerCanonicalId = appendPlayerStatements(
      input.statements,
      playerId,
      player,
    );
    input.statements.push(
      insert(
        "lineup_entries",
        {
          id: stableId("lineup", `${input.lineupKey}:${playerId}`),
          matchup_team_id: input.matchupTeamId,
          player_id: playerCanonicalId,
          slot: starters.has(playerId)
            ? (starterSlots[starters.get(playerId) ?? 0] ?? position)
            : reserve.has(playerId)
              ? "IR"
              : taxi.has(playerId)
                ? "TAXI"
                : "BN",
          classification: starters.has(playerId)
            ? "starter"
            : reserve.has(playerId)
              ? "ir"
              : "bench",
          slot_order: slotOrder,
          points: input.side.players_points[playerId] ?? 0,
          projected_points: null,
          observed_at: input.generatedAt,
        },
        ["id"],
        [
          "matchup_team_id",
          "player_id",
          "slot",
          "classification",
          "slot_order",
          "points",
          "observed_at",
        ],
      ),
    );
  }
}

export function buildSleeperImportSql(input: {
  manifests: SeasonManifest[];
  snapshots: SleeperSnapshot[];
  players: Record<string, SleeperPlayer>;
  generatedAt: string;
}) {
  const statements = [
    "PRAGMA foreign_keys = ON;",
    "BEGIN IMMEDIATE;",
    `DELETE FROM matchups
     WHERE season_source_id IN (
       SELECT id FROM season_sources WHERE provider='sleeper'
     );`,
    `DELETE FROM source_roster_accounts
     WHERE source_roster_id IN (
       SELECT sr.id FROM source_rosters sr
       JOIN season_sources ss ON ss.id=sr.season_source_id
       WHERE ss.provider='sleeper'
     );`,
    `DELETE FROM source_rosters
     WHERE season_source_id IN (
       SELECT id FROM season_sources WHERE provider='sleeper'
     );`,
    `DELETE FROM source_snapshots
     WHERE season_source_id IN (
       SELECT id FROM season_sources WHERE provider='sleeper'
     );`,
    `DELETE FROM corrections
     WHERE season_id IN (SELECT id FROM seasons WHERE year >= 2021);`,
    `DELETE FROM season_sources WHERE provider='sleeper';`,
    `DELETE FROM season_team_managers
     WHERE season_team_id IN (
       SELECT st.id FROM season_teams st
       JOIN seasons s ON s.id=st.season_id
       WHERE s.year >= 2021
     );`,
    `DELETE FROM season_teams
     WHERE season_id IN (SELECT id FROM seasons WHERE year >= 2021);`,
    `DELETE FROM provider_accounts WHERE provider='sleeper';`,
  ];
  for (const manifest of input.manifests.filter(
    (candidate) => candidate.year >= 2021,
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
        [
          "name",
          "status",
          "regular_season_end_week",
          "playoff_start_week",
          "final_week",
          "team_count",
          "visible",
          "manifest_version",
          "notes",
        ],
      ),
    );
    for (const source of manifest.sources) {
      statements.push(
        insert(
          "season_sources",
          {
            id: stableId("source", `${source.provider}:${source.externalId}`),
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
            "source_week_start",
            "source_week_end",
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
            applied_at: input.generatedAt,
          },
          ["id"],
          ["patch_json", "reason", "reviewed_by", "reviewed_at", "applied_at"],
        ),
      );
    }
  }

  for (const snapshot of input.snapshots) {
    const manifest = input.manifests.find(
      (candidate) => candidate.year === snapshot.year,
    );
    if (!manifest)
      throw new Error(`Missing manifest for Sleeper season ${snapshot.year}`);
    const configuredSource = manifest.sources.find(
      (candidate) =>
        candidate.provider === "sleeper" &&
        candidate.externalId === snapshot.league.league_id,
    );
    if (!configuredSource || !configuredSource.enabled) continue;
    const seasonId = `season-${snapshot.year}`;
    const sourceId = stableId("source", `sleeper:${snapshot.league.league_id}`);
    const users = new Map(snapshot.users.map((user) => [user.user_id, user]));
    const rosterAccountExternalIds = new Set(
      snapshot.rosters.flatMap((roster) =>
        [roster.owner_id, ...(roster.co_owners ?? [])].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    );
    const seasonTeamIds = new Map<number, string>();
    const sourceRosterIds = new Map<number, string>();

    for (const roster of snapshot.rosters) {
      const externalRosterId = `${snapshot.league.league_id}:${roster.roster_id}`;
      const canonicalRosterKey =
        manifest.rosterMappings[externalRosterId] ?? externalRosterId;
      const user = roster.owner_id ? users.get(roster.owner_id) : undefined;
      const name = teamName(user, roster);
      const seasonTeamId = stableId(
        "team",
        `${snapshot.year}:${canonicalRosterKey}`,
      );
      const sourceRosterId = stableId("roster", `sleeper:${externalRosterId}`);
      seasonTeamIds.set(roster.roster_id, seasonTeamId);
      sourceRosterIds.set(roster.roster_id, sourceRosterId);
      statements.push(
        insert(
          "season_teams",
          {
            id: seasonTeamId,
            season_id: seasonId,
            slug: `${slugify(name)}-${createHash("sha1").update(canonicalRosterKey).digest("hex").slice(0, 6)}`,
            name,
            logo_url: safeImageUrl(
              user?.avatar
                ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}`
                : null,
            ),
            group_label: configuredSource.groupLabel ?? null,
            playoff_seed: null,
            final_place:
              manifest.outcomes?.championExternalRosterId === externalRosterId
                ? 1
                : manifest.outcomes?.lastPlaceExternalRosterId ===
                    externalRosterId
                  ? manifest.teamCount
                  : null,
          },
          ["id"],
          configuredSource.role === "supplemental"
            ? []
            : ["name", "logo_url", "group_label", "final_place"],
        ),
        insert(
          "source_rosters",
          {
            id: sourceRosterId,
            season_source_id: sourceId,
            external_roster_id: externalRosterId,
            season_team_id: seasonTeamId,
            name_snapshot: name,
            logo_url_snapshot: safeImageUrl(
              user?.avatar
                ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}`
                : null,
            ),
            metadata_json: JSON.stringify({
              rosterId: roster.roster_id,
              canonicalRosterKey,
              settings: roster.settings,
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

      const accountIds = [roster.owner_id, ...(roster.co_owners ?? [])].filter(
        (id): id is string => Boolean(id),
      );
      for (const [index, accountExternalId] of accountIds.entries()) {
        const accountUser = users.get(accountExternalId);
        const displayName =
          accountUser?.display_name ?? `Sleeper ${accountExternalId}`;
        const identity = resolveIdentity(
          "sleeper",
          accountExternalId,
          displayName,
        );
        const personId = stableId("person", identity.canonicalKey);
        const accountId = stableId("account", `sleeper:${accountExternalId}`);
        statements.push(
          insert(
            "people",
            {
              id: personId,
              slug:
                identity.slug ??
                `${slugify(displayName)}-${createHash("sha1").update(accountExternalId).digest("hex").slice(0, 6)}`,
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
              provider: "sleeper",
              external_id: accountExternalId,
              person_id: personId,
              display_name: displayName,
              avatar_url: safeImageUrl(
                accountUser?.avatar
                  ? `https://sleepercdn.com/avatars/thumbs/${accountUser.avatar}`
                  : null,
              ),
              unresolved_reason: identity.reviewed
                ? null
                : "Cross-provider identity has not been reviewed",
            },
            ["provider", "external_id"],
            ["person_id", "display_name", "avatar_url", "unresolved_reason"],
          ),
          insert(
            "season_team_managers",
            {
              season_team_id: seasonTeamId,
              person_id: personId,
              role: index === 0 ? "manager" : "co_manager",
            },
            ["season_team_id", "person_id"],
            ["role"],
          ),
          insert(
            "source_roster_accounts",
            {
              source_roster_id: sourceRosterId,
              provider_account_id: accountId,
              role: index === 0 ? "owner" : "co_owner",
            },
            ["source_roster_id", "provider_account_id"],
            ["role"],
          ),
        );
      }
    }

    for (const draftSnapshot of snapshot.drafts ?? []) {
      const draftId = stableId(
        "draft",
        `sleeper:${draftSnapshot.draft.draft_id}`,
      );
      statements.push(
        insert(
          "drafts",
          {
            id: draftId,
            season_source_id: sourceId,
            external_id: draftSnapshot.draft.draft_id,
            status: draftSnapshot.draft.status,
            type: draftSnapshot.draft.type,
            rounds: draftSnapshot.draft.settings.rounds,
            teams: draftSnapshot.draft.settings.teams,
            started_at: draftSnapshot.draft.start_time
              ? new Date(draftSnapshot.draft.start_time).toISOString()
              : null,
            completed_at: draftSnapshot.draft.last_picked
              ? new Date(draftSnapshot.draft.last_picked).toISOString()
              : null,
            metadata_json: JSON.stringify(draftSnapshot.draft.metadata ?? {}),
          },
          ["season_source_id", "external_id"],
          [
            "status",
            "type",
            "rounds",
            "teams",
            "started_at",
            "completed_at",
            "metadata_json",
          ],
        ),
      );
      for (const pick of draftSnapshot.picks) {
        const playerCanonicalId = appendPlayerStatements(
          statements,
          pick.player_id,
          input.players[pick.player_id],
        );
        statements.push(
          insert(
            "draft_picks",
            {
              id: stableId(
                "draft-pick",
                `${draftSnapshot.draft.draft_id}:${pick.pick_no}`,
              ),
              draft_id: draftId,
              pick_number: pick.pick_no,
              round: pick.round,
              draft_slot: pick.draft_slot,
              player_id: playerCanonicalId,
              season_team_id: pick.roster_id
                ? (seasonTeamIds.get(pick.roster_id) ?? null)
                : null,
              provider_account_id:
                pick.picked_by && rosterAccountExternalIds.has(pick.picked_by)
                  ? stableId("account", `sleeper:${pick.picked_by}`)
                  : null,
              keeper: Boolean(
                pick.is_keeper &&
                pick.is_keeper !== "0" &&
                pick.is_keeper !== 0,
              ),
              metadata_json: JSON.stringify(pick.metadata ?? {}),
            },
            ["draft_id", "pick_number"],
            [
              "round",
              "draft_slot",
              "player_id",
              "season_team_id",
              "provider_account_id",
              "keeper",
              "metadata_json",
            ],
          ),
        );
      }
    }

    for (const transaction of snapshot.transactions ?? []) {
      const transactionId = stableId(
        "transaction",
        `sleeper:${transaction.transaction_id}`,
      );
      statements.push(
        insert(
          "league_transactions",
          {
            id: transactionId,
            season_source_id: sourceId,
            external_id: transaction.transaction_id,
            type: transaction.type,
            status: transaction.status,
            week: transaction.leg,
            creator_provider_account_id:
              transaction.creator &&
              rosterAccountExternalIds.has(transaction.creator)
                ? stableId("account", `sleeper:${transaction.creator}`)
                : null,
            created_at_provider: new Date(transaction.created).toISOString(),
            status_updated_at: transaction.status_updated
              ? new Date(transaction.status_updated).toISOString()
              : null,
            metadata_json: JSON.stringify({
              metadata: transaction.metadata ?? null,
              settings: transaction.settings ?? null,
              waiverBudget: transaction.waiver_budget,
              draftPicks: transaction.draft_picks,
            }),
          },
          ["season_source_id", "external_id"],
          [
            "type",
            "status",
            "week",
            "creator_provider_account_id",
            "created_at_provider",
            "status_updated_at",
            "metadata_json",
          ],
        ),
      );
      for (const rosterId of transaction.roster_ids) {
        const seasonTeamId = seasonTeamIds.get(rosterId);
        if (!seasonTeamId) continue;
        statements.push(
          insert(
            "transaction_rosters",
            {
              transaction_id: transactionId,
              season_team_id: seasonTeamId,
            },
            ["transaction_id", "season_team_id"],
            [],
          ),
        );
      }
      for (const [action, playerRosterIds] of [
        ["add", transaction.adds],
        ["drop", transaction.drops],
      ] as const) {
        for (const [playerId, rosterId] of Object.entries(playerRosterIds)) {
          const playerCanonicalId = appendPlayerStatements(
            statements,
            playerId,
            input.players[playerId],
          );
          statements.push(
            insert(
              "transaction_items",
              {
                id: stableId(
                  "transaction-item",
                  `${transaction.transaction_id}:${action}:${playerId}`,
                ),
                transaction_id: transactionId,
                season_team_id: seasonTeamIds.get(rosterId) ?? null,
                player_id: playerCanonicalId,
                action,
              },
              ["transaction_id", "player_id", "action"],
              ["season_team_id"],
            ),
          );
        }
      }
    }

    for (const week of configuredSource.importMatchups ? snapshot.weeks : []) {
      if (
        week.week < configuredSource.sourceWeekStart ||
        week.week > configuredSource.sourceWeekEnd
      )
        continue;
      const adapted = adaptSleeperWeek({
        leagueId: snapshot.league.league_id,
        week: week.week,
        source: configuredSource,
        manifest,
        league: snapshot.league,
        matchups: week.matchups,
        winnersBracket: snapshot.winnersBracket,
        losersBracket: snapshot.losersBracket,
        observedWeek: snapshot.league.settings.last_scored_leg ?? 0,
      });
      for (const matchup of adapted) {
        if (
          !configuredSource.includeUnpairedMatchups &&
          matchup.sides.length < 2
        )
          continue;
        const matchupId = stableId("matchup", `sleeper:${matchup.externalId}`);
        statements.push(
          insert(
            "matchups",
            {
              id: matchupId,
              season_id: seasonId,
              season_source_id: sourceId,
              external_id: matchup.externalId,
              week: matchup.week,
              phase: matchup.phase,
              round: matchup.round,
              sequence: null,
              status: matchup.status,
              bracket_order: null,
              corrected: false,
              finalized_at:
                matchup.status === "final" ? input.generatedAt : null,
            },
            ["season_source_id", "external_id"],
            ["week", "phase", "round", "status", "finalized_at"],
          ),
        );
        for (const [sideIndex, side] of matchup.sides.entries()) {
          const seasonTeamId = seasonTeamIds.get(side.roster_id);
          const sourceRosterId = sourceRosterIds.get(side.roster_id);
          if (!seasonTeamId || !sourceRosterId)
            throw new Error(
              `Unmapped roster ${side.roster_id} in ${matchup.externalId}`,
            );
          const other = matchup.sides.find(
            (candidate) => candidate.roster_id !== side.roster_id,
          );
          const matchupTeamId = stableId(
            "matchup-team",
            `${matchupId}:${sideIndex + 1}`,
          );
          statements.push(
            insert(
              "matchup_teams",
              {
                id: matchupTeamId,
                matchup_id: matchupId,
                season_team_id: seasonTeamId,
                source_roster_id: sourceRosterId,
                side: sideIndex + 1,
                points: sleeperPoints(side, configuredSource, week.week),
                projected_points: null,
                outcome:
                  matchup.status === "scheduled" || matchup.status === "live"
                    ? "pending"
                    : sleeperOutcome(side, other, configuredSource, week.week),
                entering_seed: null,
              },
              ["matchup_id", "side"],
              ["points", "outcome"],
            ),
          );

          appendLineupStatements({
            statements,
            side,
            roster: snapshot.rosters.find(
              (roster) => roster.roster_id === side.roster_id,
            ),
            snapshot,
            players: input.players,
            generatedAt: input.generatedAt,
            matchupTeamId,
            lineupKey: `sleeper:${matchup.externalId}:${side.roster_id}`,
          });
        }
      }
    }

    statements.push(
      insert(
        "source_snapshots",
        {
          id: stableId(
            "snapshot",
            `sleeper:${snapshot.league.league_id}:backfill`,
          ),
          season_source_id: sourceId,
          entity_type: "league_backfill",
          entity_key: snapshot.league.league_id,
          content_hash: snapshot.contentHash,
          observed_at: input.generatedAt,
          payload_json: JSON.stringify({
            league: snapshot.league,
            users: snapshot.users,
            rosters: snapshot.rosters,
            winnersBracket: snapshot.winnersBracket,
            losersBracket: snapshot.losersBracket,
          }),
        },
        ["entity_type", "entity_key"],
        ["content_hash", "observed_at", "payload_json"],
      ),
    );
  }

  for (const manifest of input.manifests) {
    for (const stitched of manifest.stitchedMatchups) {
      const resolvedSides = stitched.sides.map((configuredSide) => {
        const separator =
          configuredSide.sourceExternalRosterId.lastIndexOf(":");
        const leagueId = configuredSide.sourceExternalRosterId.slice(
          0,
          separator,
        );
        const rosterId = Number(
          configuredSide.sourceExternalRosterId.slice(separator + 1),
        );
        const snapshot = input.snapshots.find(
          (candidate) =>
            candidate.year === manifest.year &&
            candidate.league.league_id === leagueId,
        );
        if (!snapshot)
          throw new Error(
            `Missing source league ${leagueId} for stitched matchup ${manifest.year}:${stitched.id}`,
          );
        const source = manifest.sources.find(
          (candidate) =>
            candidate.enabled &&
            candidate.provider === "sleeper" &&
            candidate.externalId === leagueId,
        );
        if (!source)
          throw new Error(
            `Stitched matchup ${manifest.year}:${stitched.id} uses disabled source ${leagueId}`,
          );
        if (
          configuredSide.sourceWeek < source.sourceWeekStart ||
          configuredSide.sourceWeek > source.sourceWeekEnd
        )
          throw new Error(
            `Stitched matchup ${manifest.year}:${stitched.id} uses week ${configuredSide.sourceWeek} outside source ${leagueId}`,
          );
        const sourceSide = snapshot.weeks
          .find((week) => week.week === configuredSide.sourceWeek)
          ?.matchups.find((side) => side.roster_id === rosterId);
        if (!sourceSide)
          throw new Error(
            `Missing source side ${configuredSide.sourceExternalRosterId} week ${configuredSide.sourceWeek} for stitched matchup ${manifest.year}:${stitched.id}`,
          );
        const points = sleeperPoints(
          sourceSide,
          source,
          configuredSide.sourceWeek,
        );
        if (Math.abs(points - configuredSide.expectedPoints) > 0.001)
          throw new Error(
            `Stitched matchup ${manifest.year}:${stitched.id} expected ${configuredSide.expectedPoints} for ${configuredSide.sourceExternalRosterId}, received ${points}`,
          );
        const canonicalRosterKey =
          manifest.rosterMappings[configuredSide.sourceExternalRosterId] ??
          configuredSide.sourceExternalRosterId;
        return {
          configuredSide,
          snapshot,
          sourceSide,
          points,
          sourceId: stableId("source", `sleeper:${leagueId}`),
          sourceRosterId: stableId(
            "roster",
            `sleeper:${configuredSide.sourceExternalRosterId}`,
          ),
          seasonTeamId: stableId(
            "team",
            `${manifest.year}:${canonicalRosterKey}`,
          ),
        };
      });
      if (resolvedSides[0].seasonTeamId === resolvedSides[1].seasonTeamId)
        throw new Error(
          `Stitched matchup ${manifest.year}:${stitched.id} resolves both sides to one canonical team`,
        );
      const externalId = `stitched:${manifest.year}:${stitched.id}`;
      const matchupId = stableId("matchup", externalId);
      statements.push(
        insert(
          "matchups",
          {
            id: matchupId,
            season_id: `season-${manifest.year}`,
            season_source_id: resolvedSides[0].sourceId,
            external_id: externalId,
            week: stitched.week,
            phase: stitched.phase,
            round: stitched.round,
            sequence: null,
            status: "final",
            bracket_order: null,
            placement_label: stitched.placementLabel ?? null,
            corrected: false,
            finalized_at: input.generatedAt,
          },
          ["season_source_id", "external_id"],
          [
            "week",
            "phase",
            "round",
            "status",
            "placement_label",
            "corrected",
            "finalized_at",
          ],
        ),
      );
      for (const [index, resolved] of resolvedSides.entries()) {
        const other = resolvedSides[index === 0 ? 1 : 0];
        const matchupTeamId = stableId(
          "matchup-team",
          `${matchupId}:${index + 1}`,
        );
        statements.push(
          insert(
            "matchup_teams",
            {
              id: matchupTeamId,
              matchup_id: matchupId,
              season_team_id: resolved.seasonTeamId,
              source_roster_id: resolved.sourceRosterId,
              side: index + 1,
              points: resolved.points,
              projected_points: null,
              outcome:
                resolved.points === other.points
                  ? "tie"
                  : resolved.points > other.points
                    ? "win"
                    : "loss",
              entering_seed: null,
            },
            ["matchup_id", "side"],
            ["points", "outcome", "source_roster_id", "season_team_id"],
          ),
        );
        appendLineupStatements({
          statements,
          side: resolved.sourceSide,
          roster: resolved.snapshot.rosters.find(
            (roster) => roster.roster_id === resolved.sourceSide.roster_id,
          ),
          snapshot: resolved.snapshot,
          players: input.players,
          generatedAt: input.generatedAt,
          matchupTeamId,
          lineupKey: `sleeper:${externalId}:${resolved.configuredSide.sourceExternalRosterId}`,
        });
      }
    }
  }

  statements.push(
    `DELETE FROM season_team_managers AS stm
     WHERE stm.season_team_id IN (
       SELECT sr.season_team_id FROM source_rosters sr
       JOIN season_sources ss ON ss.id=sr.season_source_id
       WHERE ss.provider='sleeper' AND sr.season_team_id IS NOT NULL
     )
     AND NOT EXISTS (
       SELECT 1 FROM source_rosters sr
       JOIN season_sources ss ON ss.id=sr.season_source_id
       JOIN source_roster_accounts sra ON sra.source_roster_id=sr.id
       JOIN provider_accounts pa ON pa.id=sra.provider_account_id
       WHERE ss.provider='sleeper'
         AND sr.season_team_id=stm.season_team_id
         AND pa.person_id=stm.person_id
     );`,
    `DELETE FROM people
     WHERE id NOT IN (
       SELECT person_id FROM provider_accounts WHERE person_id IS NOT NULL
     )
     AND id NOT IN (SELECT person_id FROM season_team_managers);`,
  );
  const writeCount = statements.length;
  statements.push(
    insert(
      "sync_runs",
      {
        id: stableId("sync", `sleeper-backfill:${input.generatedAt}`),
        trigger: "backfill",
        status: "success",
        started_at: input.generatedAt,
        finished_at: input.generatedAt,
        read_count: input.snapshots.length,
        write_count: writeCount,
        upstream_request_count: 0,
        metadata_json: JSON.stringify({
          sources: input.snapshots.map((snapshot) => snapshot.league.league_id),
        }),
      },
      ["id"],
      ["status", "finished_at", "read_count", "write_count", "metadata_json"],
    ),
    "COMMIT;",
  );
  return `${statements.join("\n")}\n`;
}
