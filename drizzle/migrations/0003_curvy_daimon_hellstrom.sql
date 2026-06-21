CREATE TABLE `context_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`tags_json` text,
	`importance` text DEFAULT 'medium' NOT NULL,
	`related_goal_id` text,
	`related_initiative_id` text,
	`related_task_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`related_goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_initiative_id`) REFERENCES `initiatives`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `context_entries_source_idx` ON `context_entries` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `context_entries_importance_idx` ON `context_entries` (`importance`);--> statement-breakpoint
CREATE INDEX `context_entries_created_at_idx` ON `context_entries` (`created_at`);--> statement-breakpoint
CREATE TABLE `granola_transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`transcript_text` text NOT NULL,
	`captured_by_slack_user_id` text,
	`source_channel_id` text,
	`processing_status` text DEFAULT 'pending' NOT NULL,
	`summary` text,
	`agent_run_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `granola_transcripts_status_idx` ON `granola_transcripts` (`processing_status`);--> statement-breakpoint
CREATE INDEX `granola_transcripts_created_at_idx` ON `granola_transcripts` (`created_at`);