CREATE TABLE `scoreboard_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`match_id` text,
	`home_team` text,
	`away_team` text,
	`venue` text,
	`start_time` text,
	`match_status` text DEFAULT 'IDLE' NOT NULL,
	`runs` integer DEFAULT 0 NOT NULL,
	`wickets` integer DEFAULT 0 NOT NULL,
	`completed_overs` integer DEFAULT 0 NOT NULL,
	`balls` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
