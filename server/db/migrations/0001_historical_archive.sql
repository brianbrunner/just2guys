CREATE TABLE `draft_picks` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`pick_number` integer NOT NULL,
	`round` integer NOT NULL,
	`draft_slot` integer NOT NULL,
	`player_id` text NOT NULL,
	`season_team_id` text,
	`provider_account_id` text,
	`keeper` integer DEFAULT false NOT NULL,
	`metadata_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`season_team_id`) REFERENCES `season_teams`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`provider_account_id`) REFERENCES `provider_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_picks_draft_number_unique` ON `draft_picks` (`draft_id`,`pick_number`);--> statement-breakpoint
CREATE INDEX `draft_picks_player_idx` ON `draft_picks` (`player_id`);--> statement-breakpoint
CREATE INDEX `draft_picks_team_idx` ON `draft_picks` (`season_team_id`);--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`season_source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`status` text NOT NULL,
	`type` text NOT NULL,
	`rounds` integer NOT NULL,
	`teams` integer NOT NULL,
	`started_at` text,
	`completed_at` text,
	`metadata_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`season_source_id`) REFERENCES `season_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drafts_source_external_unique` ON `drafts` (`season_source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `drafts_source_idx` ON `drafts` (`season_source_id`);--> statement-breakpoint
CREATE TABLE `transaction_items` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`season_team_id` text,
	`player_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `league_transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_team_id`) REFERENCES `season_teams`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_items_fact_unique` ON `transaction_items` (`transaction_id`,`player_id`,`action`);--> statement-breakpoint
CREATE INDEX `transaction_items_player_idx` ON `transaction_items` (`player_id`);--> statement-breakpoint
CREATE INDEX `transaction_items_team_idx` ON `transaction_items` (`season_team_id`);--> statement-breakpoint
CREATE TABLE `transaction_rosters` (
	`transaction_id` text NOT NULL,
	`season_team_id` text NOT NULL,
	PRIMARY KEY(`transaction_id`, `season_team_id`),
	FOREIGN KEY (`transaction_id`) REFERENCES `league_transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_team_id`) REFERENCES `season_teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transaction_rosters_team_idx` ON `transaction_rosters` (`season_team_id`);--> statement-breakpoint
CREATE TABLE `league_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`season_source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`week` integer NOT NULL,
	`creator_provider_account_id` text,
	`created_at_provider` text NOT NULL,
	`status_updated_at` text,
	`metadata_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`season_source_id`) REFERENCES `season_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_provider_account_id`) REFERENCES `provider_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `league_transactions_source_external_unique` ON `league_transactions` (`season_source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `league_transactions_source_week_idx` ON `league_transactions` (`season_source_id`,`week`);