CREATE TABLE `corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`patch_json` text NOT NULL,
	`reason` text NOT NULL,
	`reviewed_by` text NOT NULL,
	`reviewed_at` text NOT NULL,
	`applied_at` text,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `corrections_season_idx` ON `corrections` (`season_id`);--> statement-breakpoint
CREATE TABLE `derived_results` (
	`key` text PRIMARY KEY NOT NULL,
	`season_id` text,
	`kind` text NOT NULL,
	`version` integer NOT NULL,
	`payload_json` text NOT NULL,
	`computed_at` text NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `derived_results_kind_season_idx` ON `derived_results` (`kind`,`season_id`);--> statement-breakpoint
CREATE TABLE `lineup_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`matchup_team_id` text NOT NULL,
	`player_id` text NOT NULL,
	`slot` text NOT NULL,
	`classification` text NOT NULL,
	`slot_order` integer NOT NULL,
	`points` real NOT NULL,
	`projected_points` real,
	`observed_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`matchup_team_id`) REFERENCES `matchup_teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lineup_entries_team_player_slot_unique` ON `lineup_entries` (`matchup_team_id`,`player_id`,`slot_order`);--> statement-breakpoint
CREATE INDEX `lineup_entries_player_idx` ON `lineup_entries` (`player_id`);--> statement-breakpoint
CREATE INDEX `lineup_entries_matchup_team_idx` ON `lineup_entries` (`matchup_team_id`);--> statement-breakpoint
CREATE TABLE `matchup_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`matchup_id` text NOT NULL,
	`season_team_id` text NOT NULL,
	`source_roster_id` text,
	`side` integer NOT NULL,
	`points` real NOT NULL,
	`projected_points` real,
	`outcome` text NOT NULL,
	`entering_seed` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`matchup_id`) REFERENCES `matchups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_team_id`) REFERENCES `season_teams`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_roster_id`) REFERENCES `source_rosters`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "matchup_teams_side_valid" CHECK("matchup_teams"."side" IN (1, 2))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matchup_teams_matchup_side_unique` ON `matchup_teams` (`matchup_id`,`side`);--> statement-breakpoint
CREATE UNIQUE INDEX `matchup_teams_matchup_team_unique` ON `matchup_teams` (`matchup_id`,`season_team_id`);--> statement-breakpoint
CREATE INDEX `matchup_teams_team_idx` ON `matchup_teams` (`season_team_id`);--> statement-breakpoint
CREATE TABLE `matchups` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`season_source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`week` integer NOT NULL,
	`phase` text NOT NULL,
	`round` integer,
	`sequence` integer,
	`status` text NOT NULL,
	`bracket_order` integer,
	`placement_label` text,
	`corrected` integer DEFAULT false NOT NULL,
	`started_at` text,
	`finalized_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_source_id`) REFERENCES `season_sources`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matchups_source_external_unique` ON `matchups` (`season_source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `matchups_season_week_idx` ON `matchups` (`season_id`,`week`);--> statement-breakpoint
CREATE INDEX `matchups_status_idx` ON `matchups` (`status`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`preferred_name` text NOT NULL,
	`aliases_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_slug_unique` ON `people` (`slug`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` text NOT NULL,
	`nfl_team` text,
	`image_url` text,
	`is_defense` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `players_name_idx` ON `players` (`name`);--> statement-breakpoint
CREATE TABLE `provider_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`person_id` text,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`unresolved_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_accounts_provider_external_unique` ON `provider_accounts` (`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `provider_accounts_person_idx` ON `provider_accounts` (`person_id`);--> statement-breakpoint
CREATE TABLE `provider_players` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`player_id` text NOT NULL,
	`metadata_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_players_provider_external_unique` ON `provider_players` (`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `provider_players_player_idx` ON `provider_players` (`player_id`);--> statement-breakpoint
CREATE TABLE `season_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`role` text NOT NULL,
	`group_label` text,
	`source_week_start` integer NOT NULL,
	`source_week_end` integer NOT NULL,
	`canonical_week_offset` integer DEFAULT 0 NOT NULL,
	`week_map_json` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`ignored_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "season_sources_week_order" CHECK("season_sources"."source_week_start" <= "season_sources"."source_week_end")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `season_sources_provider_external_unique` ON `season_sources` (`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `season_sources_season_idx` ON `season_sources` (`season_id`);--> statement-breakpoint
CREATE TABLE `season_team_managers` (
	`season_team_id` text NOT NULL,
	`person_id` text NOT NULL,
	`role` text DEFAULT 'manager' NOT NULL,
	PRIMARY KEY(`season_team_id`, `person_id`),
	FOREIGN KEY (`season_team_id`) REFERENCES `season_teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `season_team_managers_person_idx` ON `season_team_managers` (`person_id`);--> statement-breakpoint
CREATE TABLE `season_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`logo_url` text,
	`primary_color` text,
	`group_label` text,
	`playoff_seed` integer,
	`final_place` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `season_teams_season_slug_unique` ON `season_teams` (`season_id`,`slug`);--> statement-breakpoint
CREATE INDEX `season_teams_season_idx` ON `season_teams` (`season_id`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`regular_season_start_week` integer NOT NULL,
	`regular_season_end_week` integer NOT NULL,
	`playoff_start_week` integer,
	`final_week` integer NOT NULL,
	`team_count` integer NOT NULL,
	`structure` text NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`manifest_version` integer DEFAULT 1 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "seasons_week_order" CHECK("seasons"."regular_season_start_week" <= "seasons"."regular_season_end_week" AND "seasons"."regular_season_end_week" <= "seasons"."final_week")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_year_unique` ON `seasons` (`year`);--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_slug_unique` ON `seasons` (`slug`);--> statement-breakpoint
CREATE TABLE `source_roster_accounts` (
	`source_roster_id` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	PRIMARY KEY(`source_roster_id`, `provider_account_id`),
	FOREIGN KEY (`source_roster_id`) REFERENCES `source_rosters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_account_id`) REFERENCES `provider_accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `source_rosters` (
	`id` text PRIMARY KEY NOT NULL,
	`season_source_id` text NOT NULL,
	`external_roster_id` text NOT NULL,
	`season_team_id` text,
	`name_snapshot` text NOT NULL,
	`logo_url_snapshot` text,
	`metadata_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`season_source_id`) REFERENCES `season_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_team_id`) REFERENCES `season_teams`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_rosters_source_external_unique` ON `source_rosters` (`season_source_id`,`external_roster_id`);--> statement-breakpoint
CREATE INDEX `source_rosters_team_idx` ON `source_rosters` (`season_team_id`);--> statement-breakpoint
CREATE TABLE `source_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`season_source_id` text,
	`entity_type` text NOT NULL,
	`entity_key` text NOT NULL,
	`content_hash` text NOT NULL,
	`observed_at` text NOT NULL,
	`payload_json` text,
	FOREIGN KEY (`season_source_id`) REFERENCES `season_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_snapshots_entity_unique` ON `source_snapshots` (`entity_type`,`entity_key`);--> statement-breakpoint
CREATE INDEX `source_snapshots_source_idx` ON `source_snapshots` (`season_source_id`);--> statement-breakpoint
CREATE TABLE `sync_leases` (
	`name` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`acquired_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`season_id` text,
	`status` text NOT NULL,
	`category` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	`error_summary` text,
	`read_count` integer DEFAULT 0 NOT NULL,
	`write_count` integer DEFAULT 0 NOT NULL,
	`upstream_request_count` integer DEFAULT 0 NOT NULL,
	`metadata_json` text,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sync_runs_season_started_idx` ON `sync_runs` (`season_id`,`started_at`);