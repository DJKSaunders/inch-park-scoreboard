CREATE TABLE `scoreboard_undo` (
	`id` integer PRIMARY KEY NOT NULL,
	`runs` integer DEFAULT 0 NOT NULL,
	`wickets` integer DEFAULT 0 NOT NULL,
	`completed_overs` integer DEFAULT 0 NOT NULL,
	`balls` integer DEFAULT 0 NOT NULL,
	`available` integer DEFAULT false NOT NULL
);
