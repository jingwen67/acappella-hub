CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` integer NOT NULL,
	`uploaded_by` integer,
	`ext` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_photos_owner_created` ON `photos` (`owner_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_photo_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `gallery_seeded` integer DEFAULT 0 NOT NULL;