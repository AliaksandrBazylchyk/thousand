CREATE TABLE `deal_events` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`seq` integer NOT NULL,
	`dealer_id` text NOT NULL,
	`type` text NOT NULL,
	`reason` text,
	`player_id` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `deal_events_game_idx` ON `deal_events` (`game_id`,`seq`);--> statement-breakpoint
CREATE TABLE `edit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`hand_id` text,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`before` text,
	`after` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `edit_log_game_idx` ON `edit_log` (`game_id`);--> statement-breakpoint
CREATE TABLE `game_players` (
	`game_id` text NOT NULL,
	`player_id` text NOT NULL,
	`seat` integer NOT NULL,
	PRIMARY KEY(`game_id`, `player_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`host_id` text NOT NULL,
	`first_dealer_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`winner_id` text,
	`dark_declared` integer DEFAULT false NOT NULL,
	`seq_counter` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`host_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`first_dealer_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winner_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `games_room_idx` ON `games` (`room_id`);--> statement-breakpoint
CREATE TABLE `hand_inputs` (
	`hand_id` text NOT NULL,
	`player_id` text NOT NULL,
	`tricks` integer,
	`marriages` text DEFAULT '[]' NOT NULL,
	`prikup_points` integer,
	`prikup_marriage` text,
	`entered_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	PRIMARY KEY(`hand_id`, `player_id`),
	FOREIGN KEY (`hand_id`) REFERENCES `hands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `hands` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`seq` integer NOT NULL,
	`dealer_id` text NOT NULL,
	`on_hundred_id` text NOT NULL,
	`declarer_id` text NOT NULL,
	`bid` integer NOT NULL,
	`dark` text DEFAULT 'none' NOT NULL,
	`rospis` integer DEFAULT false NOT NULL,
	`golden_thousand` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'input' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `hands_game_idx` ON `hands` (`game_id`,`seq`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_room_id_name_key_unique` ON `players` (`room_id`,`name_key`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_code_unique` ON `rooms` (`code`);