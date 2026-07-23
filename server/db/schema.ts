import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
};

export const seasons = sqliteTable(
  "seasons",
  {
    id: text("id").primaryKey(),
    year: integer("year").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: text("status", {
      enum: ["planned", "pre_draft", "in_season", "complete", "needs_review"],
    }).notNull(),
    regularSeasonStartWeek: integer("regular_season_start_week").notNull(),
    regularSeasonEndWeek: integer("regular_season_end_week").notNull(),
    playoffStartWeek: integer("playoff_start_week"),
    finalWeek: integer("final_week").notNull(),
    teamCount: integer("team_count").notNull(),
    structure: text("structure", { enum: ["single", "grouped"] }).notNull(),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    manifestVersion: integer("manifest_version").notNull().default(1),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("seasons_year_unique").on(table.year),
    uniqueIndex("seasons_slug_unique").on(table.slug),
    check(
      "seasons_week_order",
      sql`${table.regularSeasonStartWeek} <= ${table.regularSeasonEndWeek} AND ${table.regularSeasonEndWeek} <= ${table.finalWeek}`,
    ),
  ],
);

export const seasonSources = sqliteTable(
  "season_sources",
  {
    id: text("id").primaryKey(),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["yahoo", "sleeper"] }).notNull(),
    externalId: text("external_id").notNull(),
    role: text("role", {
      enum: ["full", "regular_season", "postseason", "supplemental"],
    }).notNull(),
    groupLabel: text("group_label"),
    sourceWeekStart: integer("source_week_start").notNull(),
    sourceWeekEnd: integer("source_week_end").notNull(),
    canonicalWeekOffset: integer("canonical_week_offset").notNull().default(0),
    weekMapJson: text("week_map_json"),
    priority: integer("priority").notNull().default(0),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    ignoredReason: text("ignored_reason"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("season_sources_provider_external_unique").on(
      table.provider,
      table.externalId,
    ),
    index("season_sources_season_idx").on(table.seasonId),
    check(
      "season_sources_week_order",
      sql`${table.sourceWeekStart} <= ${table.sourceWeekEnd}`,
    ),
  ],
);

export const people = sqliteTable(
  "people",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    preferredName: text("preferred_name").notNull(),
    aliasesJson: text("aliases_json").notNull().default("[]"),
    ...timestamps,
  },
  (table) => [uniqueIndex("people_slug_unique").on(table.slug)],
);

export const providerAccounts = sqliteTable(
  "provider_accounts",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: ["yahoo", "sleeper"] }).notNull(),
    externalId: text("external_id").notNull(),
    personId: text("person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    unresolvedReason: text("unresolved_reason"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("provider_accounts_provider_external_unique").on(
      table.provider,
      table.externalId,
    ),
    index("provider_accounts_person_idx").on(table.personId),
  ],
);

export const seasonTeams = sqliteTable(
  "season_teams",
  {
    id: text("id").primaryKey(),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    primaryColor: text("primary_color"),
    groupLabel: text("group_label"),
    playoffSeed: integer("playoff_seed"),
    finalPlace: integer("final_place"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("season_teams_season_slug_unique").on(
      table.seasonId,
      table.slug,
    ),
    index("season_teams_season_idx").on(table.seasonId),
  ],
);

export const seasonTeamManagers = sqliteTable(
  "season_team_managers",
  {
    seasonTeamId: text("season_team_id")
      .notNull()
      .references(() => seasonTeams.id, { onDelete: "cascade" }),
    personId: text("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    role: text("role", { enum: ["manager", "co_manager"] })
      .notNull()
      .default("manager"),
  },
  (table) => [
    primaryKey({ columns: [table.seasonTeamId, table.personId] }),
    index("season_team_managers_person_idx").on(table.personId),
  ],
);

export const sourceRosters = sqliteTable(
  "source_rosters",
  {
    id: text("id").primaryKey(),
    seasonSourceId: text("season_source_id")
      .notNull()
      .references(() => seasonSources.id, { onDelete: "cascade" }),
    externalRosterId: text("external_roster_id").notNull(),
    seasonTeamId: text("season_team_id").references(() => seasonTeams.id, {
      onDelete: "set null",
    }),
    nameSnapshot: text("name_snapshot").notNull(),
    logoUrlSnapshot: text("logo_url_snapshot"),
    metadataJson: text("metadata_json"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("source_rosters_source_external_unique").on(
      table.seasonSourceId,
      table.externalRosterId,
    ),
    index("source_rosters_team_idx").on(table.seasonTeamId),
  ],
);

export const sourceRosterAccounts = sqliteTable(
  "source_roster_accounts",
  {
    sourceRosterId: text("source_roster_id")
      .notNull()
      .references(() => sourceRosters.id, { onDelete: "cascade" }),
    providerAccountId: text("provider_account_id")
      .notNull()
      .references(() => providerAccounts.id, { onDelete: "restrict" }),
    role: text("role", { enum: ["owner", "co_owner"] })
      .notNull()
      .default("owner"),
  },
  (table) => [
    primaryKey({ columns: [table.sourceRosterId, table.providerAccountId] }),
  ],
);

export const players = sqliteTable(
  "players",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    position: text("position").notNull(),
    nflTeam: text("nfl_team"),
    imageUrl: text("image_url"),
    isDefense: integer("is_defense", { mode: "boolean" })
      .notNull()
      .default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [index("players_name_idx").on(table.name)],
);

export const providerPlayers = sqliteTable(
  "provider_players",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: ["yahoo", "sleeper"] }).notNull(),
    externalId: text("external_id").notNull(),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    metadataJson: text("metadata_json"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("provider_players_provider_external_unique").on(
      table.provider,
      table.externalId,
    ),
    index("provider_players_player_idx").on(table.playerId),
  ],
);

export const matchups = sqliteTable(
  "matchups",
  {
    id: text("id").primaryKey(),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    seasonSourceId: text("season_source_id")
      .notNull()
      .references(() => seasonSources.id, { onDelete: "restrict" }),
    externalId: text("external_id").notNull(),
    week: integer("week").notNull(),
    phase: text("phase", {
      enum: ["regular", "winners", "consolation", "losers", "placement"],
    }).notNull(),
    round: integer("round"),
    sequence: integer("sequence"),
    status: text("status", {
      enum: ["scheduled", "live", "final", "corrected", "cancelled", "bye"],
    }).notNull(),
    bracketOrder: integer("bracket_order"),
    placementLabel: text("placement_label"),
    corrected: integer("corrected", { mode: "boolean" })
      .notNull()
      .default(false),
    startedAt: text("started_at"),
    finalizedAt: text("finalized_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("matchups_source_external_unique").on(
      table.seasonSourceId,
      table.externalId,
    ),
    index("matchups_season_week_idx").on(table.seasonId, table.week),
    index("matchups_status_idx").on(table.status),
  ],
);

export const matchupTeams = sqliteTable(
  "matchup_teams",
  {
    id: text("id").primaryKey(),
    matchupId: text("matchup_id")
      .notNull()
      .references(() => matchups.id, { onDelete: "cascade" }),
    seasonTeamId: text("season_team_id")
      .notNull()
      .references(() => seasonTeams.id, { onDelete: "restrict" }),
    sourceRosterId: text("source_roster_id").references(
      () => sourceRosters.id,
      { onDelete: "set null" },
    ),
    side: integer("side").notNull(),
    points: real("points").notNull(),
    projectedPoints: real("projected_points"),
    outcome: text("outcome", {
      enum: ["win", "loss", "tie", "bye", "pending"],
    }).notNull(),
    enteringSeed: integer("entering_seed"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("matchup_teams_matchup_side_unique").on(
      table.matchupId,
      table.side,
    ),
    uniqueIndex("matchup_teams_matchup_team_unique").on(
      table.matchupId,
      table.seasonTeamId,
    ),
    index("matchup_teams_team_idx").on(table.seasonTeamId),
    check("matchup_teams_side_valid", sql`${table.side} IN (1, 2)`),
  ],
);

export const lineupEntries = sqliteTable(
  "lineup_entries",
  {
    id: text("id").primaryKey(),
    matchupTeamId: text("matchup_team_id")
      .notNull()
      .references(() => matchupTeams.id, { onDelete: "cascade" }),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    slot: text("slot").notNull(),
    classification: text("classification", {
      enum: ["starter", "bench", "ir"],
    }).notNull(),
    slotOrder: integer("slot_order").notNull(),
    points: real("points").notNull(),
    projectedPoints: real("projected_points"),
    observedAt: text("observed_at").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("lineup_entries_team_player_slot_unique").on(
      table.matchupTeamId,
      table.playerId,
      table.slotOrder,
    ),
    index("lineup_entries_player_idx").on(table.playerId),
    index("lineup_entries_matchup_team_idx").on(table.matchupTeamId),
  ],
);

export const drafts = sqliteTable(
  "drafts",
  {
    id: text("id").primaryKey(),
    seasonSourceId: text("season_source_id")
      .notNull()
      .references(() => seasonSources.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    status: text("status").notNull(),
    type: text("type").notNull(),
    rounds: integer("rounds").notNull(),
    teams: integer("teams").notNull(),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    metadataJson: text("metadata_json"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("drafts_source_external_unique").on(
      table.seasonSourceId,
      table.externalId,
    ),
    index("drafts_source_idx").on(table.seasonSourceId),
  ],
);

export const draftPicks = sqliteTable(
  "draft_picks",
  {
    id: text("id").primaryKey(),
    draftId: text("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    pickNumber: integer("pick_number").notNull(),
    round: integer("round").notNull(),
    draftSlot: integer("draft_slot").notNull(),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    seasonTeamId: text("season_team_id").references(() => seasonTeams.id, {
      onDelete: "set null",
    }),
    providerAccountId: text("provider_account_id").references(
      () => providerAccounts.id,
      { onDelete: "set null" },
    ),
    keeper: integer("keeper", { mode: "boolean" }).notNull().default(false),
    metadataJson: text("metadata_json"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("draft_picks_draft_number_unique").on(
      table.draftId,
      table.pickNumber,
    ),
    index("draft_picks_player_idx").on(table.playerId),
    index("draft_picks_team_idx").on(table.seasonTeamId),
  ],
);

export const transactions = sqliteTable(
  "league_transactions",
  {
    id: text("id").primaryKey(),
    seasonSourceId: text("season_source_id")
      .notNull()
      .references(() => seasonSources.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    week: integer("week").notNull(),
    creatorProviderAccountId: text("creator_provider_account_id").references(
      () => providerAccounts.id,
      { onDelete: "set null" },
    ),
    createdAtProvider: text("created_at_provider").notNull(),
    statusUpdatedAt: text("status_updated_at"),
    metadataJson: text("metadata_json"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("league_transactions_source_external_unique").on(
      table.seasonSourceId,
      table.externalId,
    ),
    index("league_transactions_source_week_idx").on(
      table.seasonSourceId,
      table.week,
    ),
  ],
);

export const transactionRosters = sqliteTable(
  "transaction_rosters",
  {
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    seasonTeamId: text("season_team_id")
      .notNull()
      .references(() => seasonTeams.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.transactionId, table.seasonTeamId] }),
    index("transaction_rosters_team_idx").on(table.seasonTeamId),
  ],
);

export const transactionItems = sqliteTable(
  "transaction_items",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    seasonTeamId: text("season_team_id").references(() => seasonTeams.id, {
      onDelete: "set null",
    }),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    action: text("action", { enum: ["add", "drop"] }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("transaction_items_fact_unique").on(
      table.transactionId,
      table.playerId,
      table.action,
    ),
    index("transaction_items_player_idx").on(table.playerId),
    index("transaction_items_team_idx").on(table.seasonTeamId),
  ],
);

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    trigger: text("trigger", {
      enum: ["cron", "manual", "backfill", "migration"],
    }).notNull(),
    seasonId: text("season_id").references(() => seasons.id, {
      onDelete: "set null",
    }),
    status: text("status", {
      enum: ["running", "success", "partial", "failed", "skipped"],
    }).notNull(),
    category: text("category", {
      enum: ["upstream", "validation", "mapping", "database", "application"],
    }),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    errorSummary: text("error_summary"),
    readCount: integer("read_count").notNull().default(0),
    writeCount: integer("write_count").notNull().default(0),
    upstreamRequestCount: integer("upstream_request_count")
      .notNull()
      .default(0),
    metadataJson: text("metadata_json"),
  },
  (table) => [
    index("sync_runs_season_started_idx").on(table.seasonId, table.startedAt),
  ],
);

export const sourceSnapshots = sqliteTable(
  "source_snapshots",
  {
    id: text("id").primaryKey(),
    seasonSourceId: text("season_source_id").references(
      () => seasonSources.id,
      { onDelete: "cascade" },
    ),
    entityType: text("entity_type").notNull(),
    entityKey: text("entity_key").notNull(),
    contentHash: text("content_hash").notNull(),
    observedAt: text("observed_at").notNull(),
    payloadJson: text("payload_json"),
  },
  (table) => [
    uniqueIndex("source_snapshots_entity_unique").on(
      table.entityType,
      table.entityKey,
    ),
    index("source_snapshots_source_idx").on(table.seasonSourceId),
  ],
);

export const syncLeases = sqliteTable("sync_leases", {
  name: text("name").primaryKey(),
  owner: text("owner").notNull(),
  acquiredAt: text("acquired_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const corrections = sqliteTable(
  "corrections",
  {
    id: text("id").primaryKey(),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    patchJson: text("patch_json").notNull(),
    reason: text("reason").notNull(),
    reviewedBy: text("reviewed_by").notNull(),
    reviewedAt: text("reviewed_at").notNull(),
    appliedAt: text("applied_at"),
  },
  (table) => [index("corrections_season_idx").on(table.seasonId)],
);

export const derivedResults = sqliteTable(
  "derived_results",
  {
    key: text("key").primaryKey(),
    seasonId: text("season_id").references(() => seasons.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    version: integer("version").notNull(),
    payloadJson: text("payload_json").notNull(),
    computedAt: text("computed_at").notNull(),
  },
  (table) => [
    index("derived_results_kind_season_idx").on(table.kind, table.seasonId),
  ],
);
