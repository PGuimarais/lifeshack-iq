CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_type` text NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`input_json` text,
	`output_json` text,
	`model` text,
	`prompt_versions_json` text,
	`config_versions_json` text,
	`started_at` text,
	`finished_at` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`action_type` text NOT NULL,
	`proposed_by_run_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_from_person_id` text,
	`approved_by_person_id` text,
	`request_message` text,
	`action_payload_json` text,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`proposed_by_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_from_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `backup_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`local_path` text,
	`s3_uri` text,
	`sha256` text,
	`size_bytes` integer,
	`error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `config_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`actor_slack_user_id` text,
	`target_type` text,
	`target_id` text,
	`before_json` text,
	`after_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_date` text NOT NULL,
	`revenue_json` text,
	`ops_json` text,
	`app_volume_json` text,
	`ats_json` text,
	`customer_quality_json` text,
	`raw_sources_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `daily_snapshots_snapshot_date_idx` ON `daily_snapshots` (`snapshot_date`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`area` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `initiatives` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`progress` text,
	`owner_person_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `issues` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`severity` text DEFAULT 'medium' NOT NULL,
	`area` text,
	`status` text DEFAULT 'open' NOT NULL,
	`first_seen_at` text,
	`last_seen_at` text,
	`snoozed_until` text,
	`owner_person_id` text,
	`evidence_json` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload_json` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`run_at` text NOT NULL,
	`locked_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meta_change_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`requested_by_slack_user_id` text,
	`request_text` text NOT NULL,
	`proposed_diff_json` text,
	`risk_level` text,
	`status` text DEFAULT 'proposed' NOT NULL,
	`approved_by_slack_user_id` text,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE TABLE `meta_config_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text,
	`version_number` integer NOT NULL,
	`value_json` text NOT NULL,
	`change_reason` text,
	`created_by_slack_user_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`config_id`) REFERENCES `meta_configs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meta_config_versions_config_version_idx` ON `meta_config_versions` (`config_id`,`version_number`);--> statement-breakpoint
CREATE TABLE `meta_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`namespace` text NOT NULL,
	`key` text NOT NULL,
	`active_version_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meta_configs_namespace_key_idx` ON `meta_configs` (`namespace`,`key`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slack_user_id` text,
	`role` text,
	`strengths_json` text,
	`weaknesses_json` text,
	`checkin_schedule_json` text,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prompt_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`active_version_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_modules_name_unique` ON `prompt_modules` (`name`);--> statement-breakpoint
CREATE TABLE `prompt_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_module_id` text,
	`version_number` integer NOT NULL,
	`prompt_text` text NOT NULL,
	`change_reason` text,
	`created_by_slack_user_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`prompt_module_id`) REFERENCES `prompt_modules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_versions_module_version_idx` ON `prompt_versions` (`prompt_module_id`,`version_number`);--> statement-breakpoint
CREATE TABLE `slack_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`thread_ts` text,
	`related_issue_id` text,
	`related_task_id` text,
	`related_agent_run_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`related_issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`initiative_id` text,
	`issue_id` text,
	`owner_person_id` text,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`due_date` text,
	`notes` text,
	`links_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`initiative_id`) REFERENCES `initiatives`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_run_id` text,
	`tool_name` text NOT NULL,
	`input_json` text,
	`output_json` text,
	`status` text DEFAULT 'created' NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
