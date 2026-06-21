import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const people = sqliteTable("people", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slackUserId: text("slack_user_id"),
  role: text("role"),
  strengthsJson: text("strengths_json"),
  weaknessesJson: text("weaknesses_json"),
  checkinScheduleJson: text("checkin_schedule_json"),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  area: text("area"),
  ownerPersonId: text("owner_person_id").references(() => people.id),
  targetMetric: text("target_metric"),
  targetValue: text("target_value"),
  dueDate: text("due_date"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({
  statusIdx: index("goals_status_idx").on(table.status),
  ownerStatusIdx: index("goals_owner_status_idx").on(table.ownerPersonId, table.status)
}));

export const issues = sqliteTable("issues", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  severity: text("severity").notNull().default("medium"),
  area: text("area"),
  status: text("status").notNull().default("open"),
  firstSeenAt: text("first_seen_at"),
  lastSeenAt: text("last_seen_at"),
  snoozedUntil: text("snoozed_until"),
  ownerPersonId: text("owner_person_id").references(() => people.id),
  evidenceJson: text("evidence_json"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({
  statusIdx: index("issues_status_idx").on(table.status),
  ownerStatusIdx: index("issues_owner_status_idx").on(table.ownerPersonId, table.status),
  severityStatusIdx: index("issues_severity_status_idx").on(table.severity, table.status),
  lastSeenIdx: index("issues_last_seen_idx").on(table.lastSeenAt)
}));

export const initiatives = sqliteTable("initiatives", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").references(() => goals.id),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  progress: text("progress"),
  ownerPersonId: text("owner_person_id").references(() => people.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  initiativeId: text("initiative_id").references(() => initiatives.id),
  issueId: text("issue_id").references(() => issues.id),
  ownerPersonId: text("owner_person_id").references(() => people.id),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("medium"),
  dueDate: text("due_date"),
  notes: text("notes"),
  linksJson: text("links_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({
  statusIdx: index("tasks_status_idx").on(table.status),
  ownerStatusIdx: index("tasks_owner_status_idx").on(table.ownerPersonId, table.status),
  issueIdx: index("tasks_issue_idx").on(table.issueId)
}));

export const dailySnapshots = sqliteTable("daily_snapshots", {
  id: text("id").primaryKey(),
  snapshotDate: text("snapshot_date").notNull(),
  revenueJson: text("revenue_json"),
  opsJson: text("ops_json"),
  appVolumeJson: text("app_volume_json"),
  atsJson: text("ats_json"),
  customerQualityJson: text("customer_quality_json"),
  rawSourcesJson: text("raw_sources_json"),
  createdAt: text("created_at").notNull()
}, (table) => ({
  snapshotDateIdx: index("daily_snapshots_snapshot_date_idx").on(table.snapshotDate)
}));

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  workflowType: text("workflow_type").notNull(),
  status: text("status").notNull().default("created"),
  inputJson: text("input_json"),
  outputJson: text("output_json"),
  model: text("model"),
  promptVersionsJson: text("prompt_versions_json"),
  configVersionsJson: text("config_versions_json"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const toolCalls = sqliteTable("tool_calls", {
  id: text("id").primaryKey(),
  agentRunId: text("agent_run_id").references(() => agentRuns.id),
  toolName: text("tool_name").notNull(),
  inputJson: text("input_json"),
  outputJson: text("output_json"),
  status: text("status").notNull().default("created"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  finishedAt: text("finished_at")
});

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  actionType: text("action_type").notNull(),
  proposedByRunId: text("proposed_by_run_id").references(() => agentRuns.id),
  status: text("status").notNull().default("pending"),
  requestedFromPersonId: text("requested_from_person_id").references(() => people.id),
  approvedByPersonId: text("approved_by_person_id").references(() => people.id),
  requestMessage: text("request_message"),
  actionPayloadJson: text("action_payload_json"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at")
}, (table) => ({
  statusIdx: index("approvals_status_idx").on(table.status),
  actionTypeStatusIdx: index("approvals_action_type_status_idx").on(table.actionType, table.status),
  requestedFromStatusIdx: index("approvals_requested_from_status_idx").on(
    table.requestedFromPersonId,
    table.status
  )
}));

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  payloadJson: text("payload_json"),
  status: text("status").notNull().default("queued"),
  runAt: text("run_at").notNull(),
  lockedAt: text("locked_at"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const workflowSchedules = sqliteTable("workflow_schedules", {
  id: text("id").primaryKey(),
  workflowType: text("workflow_type").notNull(),
  label: text("label").notNull(),
  enabled: integer("enabled").notNull().default(1),
  cadence: text("cadence").notNull().default("daily"),
  timeOfDay: text("time_of_day"),
  timezone: text("timezone").notNull().default("America/New_York"),
  dayOfWeek: integer("day_of_week"),
  intervalMs: integer("interval_ms"),
  productionWorkflow: integer("production_workflow").notNull().default(0),
  payloadJson: text("payload_json"),
  nextRunAt: text("next_run_at"),
  lastRunAt: text("last_run_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({
  workflowTypeIdx: index("workflow_schedules_workflow_type_idx").on(table.workflowType),
  nextRunIdx: index("workflow_schedules_next_run_idx").on(table.enabled, table.nextRunAt),
  labelIdx: uniqueIndex("workflow_schedules_label_idx").on(table.label)
}));

export const checkins = sqliteTable("checkins", {
  id: text("id").primaryKey(),
  personId: text("person_id").references(() => people.id),
  jobId: text("job_id").references(() => jobs.id),
  channelId: text("channel_id"),
  messageTs: text("message_ts"),
  status: text("status").notNull().default("pending"),
  promptText: text("prompt_text").notNull(),
  responseText: text("response_text"),
  responseTs: text("response_ts"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({
  personStatusIdx: index("checkins_person_status_idx").on(table.personId, table.status),
  channelStatusIdx: index("checkins_channel_status_idx").on(table.channelId, table.status),
  createdAtIdx: index("checkins_created_at_idx").on(table.createdAt)
}));

export const granolaTranscripts = sqliteTable("granola_transcripts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  transcriptText: text("transcript_text").notNull(),
  capturedBySlackUserId: text("captured_by_slack_user_id"),
  sourceChannelId: text("source_channel_id"),
  processingStatus: text("processing_status").notNull().default("pending"),
  summary: text("summary"),
  agentRunId: text("agent_run_id").references(() => agentRuns.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({
  statusIdx: index("granola_transcripts_status_idx").on(table.processingStatus),
  createdAtIdx: index("granola_transcripts_created_at_idx").on(table.createdAt)
}));

export const contextEntries = sqliteTable("context_entries", {
  id: text("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  tagsJson: text("tags_json"),
  importance: text("importance").notNull().default("medium"),
  relatedGoalId: text("related_goal_id").references(() => goals.id),
  relatedInitiativeId: text("related_initiative_id").references(() => initiatives.id),
  relatedTaskId: text("related_task_id").references(() => tasks.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({
  sourceIdx: index("context_entries_source_idx").on(table.sourceType, table.sourceId),
  importanceIdx: index("context_entries_importance_idx").on(table.importance),
  createdAtIdx: index("context_entries_created_at_idx").on(table.createdAt)
}));

export const metaConfigs = sqliteTable("meta_configs", {
  id: text("id").primaryKey(),
  namespace: text("namespace").notNull(),
  key: text("key").notNull(),
  activeVersionId: text("active_version_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({
  namespaceKeyIdx: uniqueIndex("meta_configs_namespace_key_idx").on(table.namespace, table.key)
}));

export const metaConfigVersions = sqliteTable("meta_config_versions", {
  id: text("id").primaryKey(),
  configId: text("config_id").references(() => metaConfigs.id),
  versionNumber: integer("version_number").notNull(),
  valueJson: text("value_json").notNull(),
  changeReason: text("change_reason"),
  createdBySlackUserId: text("created_by_slack_user_id"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull()
}, (table) => ({
  configVersionIdx: uniqueIndex("meta_config_versions_config_version_idx").on(
    table.configId,
    table.versionNumber
  )
}));

export const promptModules = sqliteTable("prompt_modules", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  activeVersionId: text("active_version_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const promptVersions = sqliteTable("prompt_versions", {
  id: text("id").primaryKey(),
  promptModuleId: text("prompt_module_id").references(() => promptModules.id),
  versionNumber: integer("version_number").notNull(),
  promptText: text("prompt_text").notNull(),
  changeReason: text("change_reason"),
  createdBySlackUserId: text("created_by_slack_user_id"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull()
}, (table) => ({
  promptVersionIdx: uniqueIndex("prompt_versions_module_version_idx").on(
    table.promptModuleId,
    table.versionNumber
  )
}));

export const metaChangeRequests = sqliteTable("meta_change_requests", {
  id: text("id").primaryKey(),
  requestedBySlackUserId: text("requested_by_slack_user_id"),
  requestText: text("request_text").notNull(),
  proposedDiffJson: text("proposed_diff_json"),
  riskLevel: text("risk_level"),
  status: text("status").notNull().default("proposed"),
  approvedBySlackUserId: text("approved_by_slack_user_id"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at")
});

export const configEvents = sqliteTable("config_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  actorSlackUserId: text("actor_slack_user_id"),
  targetType: text("target_type"),
  targetId: text("target_id"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: text("created_at").notNull()
});

export const slackThreads = sqliteTable("slack_threads", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull(),
  threadTs: text("thread_ts"),
  relatedIssueId: text("related_issue_id").references(() => issues.id),
  relatedTaskId: text("related_task_id").references(() => tasks.id),
  relatedAgentRunId: text("related_agent_run_id").references(() => agentRuns.id),
  createdAt: text("created_at").notNull()
}, (table) => ({
  channelThreadIdx: index("slack_threads_channel_thread_idx").on(table.channelId, table.threadTs),
  issueIdx: index("slack_threads_issue_idx").on(table.relatedIssueId),
  taskIdx: index("slack_threads_task_idx").on(table.relatedTaskId)
}));

export const backupRuns = sqliteTable("backup_runs", {
  id: text("id").primaryKey(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  status: text("status").notNull(),
  localPath: text("local_path"),
  s3Uri: text("s3_uri"),
  sha256: text("sha256"),
  sizeBytes: integer("size_bytes"),
  error: text("error"),
  createdAt: text("created_at").notNull()
}, (table) => ({
  statusIdx: index("backup_runs_status_idx").on(table.status),
  startedAtIdx: index("backup_runs_started_at_idx").on(table.startedAt)
}));
