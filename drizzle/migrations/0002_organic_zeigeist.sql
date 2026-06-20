CREATE TABLE `checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text,
	`job_id` text,
	`channel_id` text,
	`message_ts` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`prompt_text` text NOT NULL,
	`response_text` text,
	`response_ts` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `checkins_person_status_idx` ON `checkins` (`person_id`,`status`);--> statement-breakpoint
CREATE INDEX `checkins_channel_status_idx` ON `checkins` (`channel_id`,`status`);--> statement-breakpoint
CREATE INDEX `checkins_created_at_idx` ON `checkins` (`created_at`);--> statement-breakpoint
CREATE TABLE `workflow_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_type` text NOT NULL,
	`label` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`cadence` text DEFAULT 'daily' NOT NULL,
	`time_of_day` text,
	`timezone` text DEFAULT 'America/New_York' NOT NULL,
	`day_of_week` integer,
	`interval_ms` integer,
	`production_workflow` integer DEFAULT 0 NOT NULL,
	`payload_json` text,
	`next_run_at` text,
	`last_run_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workflow_schedules_workflow_type_idx` ON `workflow_schedules` (`workflow_type`);--> statement-breakpoint
CREATE INDEX `workflow_schedules_next_run_idx` ON `workflow_schedules` (`enabled`,`next_run_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_schedules_label_idx` ON `workflow_schedules` (`label`);--> statement-breakpoint
ALTER TABLE `goals` ADD `owner_person_id` text REFERENCES people(id);--> statement-breakpoint
ALTER TABLE `goals` ADD `target_metric` text;--> statement-breakpoint
ALTER TABLE `goals` ADD `target_value` text;--> statement-breakpoint
ALTER TABLE `goals` ADD `due_date` text;--> statement-breakpoint
CREATE INDEX `goals_status_idx` ON `goals` (`status`);--> statement-breakpoint
CREATE INDEX `goals_owner_status_idx` ON `goals` (`owner_person_id`,`status`);