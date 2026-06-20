CREATE INDEX `approvals_status_idx` ON `approvals` (`status`);--> statement-breakpoint
CREATE INDEX `approvals_action_type_status_idx` ON `approvals` (`action_type`,`status`);--> statement-breakpoint
CREATE INDEX `approvals_requested_from_status_idx` ON `approvals` (`requested_from_person_id`,`status`);--> statement-breakpoint
CREATE INDEX `backup_runs_status_idx` ON `backup_runs` (`status`);--> statement-breakpoint
CREATE INDEX `backup_runs_started_at_idx` ON `backup_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `issues_status_idx` ON `issues` (`status`);--> statement-breakpoint
CREATE INDEX `issues_owner_status_idx` ON `issues` (`owner_person_id`,`status`);--> statement-breakpoint
CREATE INDEX `issues_severity_status_idx` ON `issues` (`severity`,`status`);--> statement-breakpoint
CREATE INDEX `issues_last_seen_idx` ON `issues` (`last_seen_at`);--> statement-breakpoint
CREATE INDEX `slack_threads_channel_thread_idx` ON `slack_threads` (`channel_id`,`thread_ts`);--> statement-breakpoint
CREATE INDEX `slack_threads_issue_idx` ON `slack_threads` (`related_issue_id`);--> statement-breakpoint
CREATE INDEX `slack_threads_task_idx` ON `slack_threads` (`related_task_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_owner_status_idx` ON `tasks` (`owner_person_id`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_issue_idx` ON `tasks` (`issue_id`);