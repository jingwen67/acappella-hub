CREATE TABLE `arrangers` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `arrangers_name_unique` ON `arrangers` (`name`);--> statement-breakpoint
CREATE TABLE `candidacies` (
	`phase_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`phase_id`, `user_id`),
	FOREIGN KEY (`phase_id`) REFERENCES `phases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `phases` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL,
	`closed_at` text,
	`arranger_id` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`arranger_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "phase_status" CHECK("phases"."status" in ('open', 'closed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_open_phase` ON `phases` (`status`) WHERE "phases"."status" = 'open';--> statement-breakpoint
CREATE TABLE `scores` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`arranger` text NOT NULL,
	`kind` text NOT NULL,
	`semester_id` integer,
	`semester_label` text NOT NULL,
	`file_name` text NOT NULL,
	`drive_file_id` text,
	`drive_url` text,
	`uploaded_by` integer NOT NULL,
	`created_at` text NOT NULL,
	`kinds` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`semester_id`) REFERENCES `semesters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "score_kind" CHECK("scores"."kind" in ('big', 'small'))
);
--> statement-breakpoint
CREATE TABLE `semesters` (
	`id` integer PRIMARY KEY NOT NULL,
	`label` text COLLATE NOCASE NOT NULL,
	`folder_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `semesters_label_unique` ON `semesters` (`label`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`is_admin` integer DEFAULT 0 NOT NULL,
	`can_start` integer DEFAULT 0 NOT NULL,
	`is_md` integer DEFAULT 0 NOT NULL,
	`is_arranger` integer DEFAULT 0 NOT NULL,
	`is_alumni` integer DEFAULT 0 NOT NULL,
	`is_president` integer DEFAULT 0 NOT NULL,
	`is_vp` integer DEFAULT 0 NOT NULL,
	`is_secretary` integer DEFAULT 0 NOT NULL,
	`is_treasurer` integer DEFAULT 0 NOT NULL,
	`is_media` integer DEFAULT 0 NOT NULL,
	`full_name` text DEFAULT '' NOT NULL,
	`pronouns` text DEFAULT '' NOT NULL,
	`position` text DEFAULT '' NOT NULL,
	`voice_part` text DEFAULT '' NOT NULL,
	`school` text DEFAULT '' NOT NULL,
	`grad_year` text DEFAULT '' NOT NULL,
	`program` text DEFAULT '' NOT NULL,
	`fun_fact` text DEFAULT '' NOT NULL,
	`favorite_food` text DEFAULT '' NOT NULL,
	`avatar_ext` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);--> statement-breakpoint
CREATE TABLE `votes` (
	`phase_id` integer NOT NULL,
	`voter_id` integer NOT NULL,
	`candidate_id` integer NOT NULL,
	`reaction` text NOT NULL,
	PRIMARY KEY(`phase_id`, `voter_id`, `candidate_id`),
	FOREIGN KEY (`phase_id`) REFERENCES `phases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "vote_reaction" CHECK("votes"."reaction" in ('like', 'again'))
);
