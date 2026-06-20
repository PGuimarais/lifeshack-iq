import type { QueueJob, WorkflowJobType } from "../db/queue";
import { runApprovalActionWorkflow } from "../workflows/approvalAction";
import { runBackupSqliteWorkflow } from "../workflows/backupSqlite";
import { runDailyCriticalScanWorkflow } from "../workflows/dailyCriticalScan";
import { runDailyGroupReportWorkflow } from "../workflows/dailyGroupReport";
import { runMetaChangeRequestWorkflow } from "../workflows/metaChangeRequest";
import { runTeammateCheckinWorkflow } from "../workflows/teammateCheckin";
import { runWeeklyReflectionWorkflow } from "../workflows/weeklyReflection";

export type WorkflowContext = {
  job?: QueueJob;
  payload?: unknown;
  source: "scheduler" | "slack" | "worker" | "test";
};

export type WorkflowResult = {
  workflowType: WorkflowJobType;
  status: "succeeded" | "failed";
  summary: string;
  agentRunId?: string;
  backupRunId?: string;
  details?: unknown;
};

export type WorkflowDefinition = {
  type: WorkflowJobType;
  title: string;
  description: string;
  aliases: string[];
  run: (context: WorkflowContext) => Promise<WorkflowResult>;
};

const definitions: WorkflowDefinition[] = [
  {
    type: "daily_critical_scan",
    title: "Daily Critical Scan",
    description: "Create a data snapshot and detect obvious hard-failure critical issues.",
    aliases: ["critical-scan", "critical_scan", "daily-critical-scan"],
    run: runDailyCriticalScanWorkflow
  },
  {
    type: "daily_group_report",
    title: "Daily Group Report",
    description: "Create a fixture/manual data snapshot and generate a Slack-ready company report.",
    aliases: ["daily-report", "daily_group_report", "daily-group-report"],
    run: runDailyGroupReportWorkflow
  },
  {
    type: "weekly_reflection",
    title: "Weekly Reflection",
    description: "Placeholder weekly strategy reflection workflow.",
    aliases: ["weekly-reflection", "weekly_reflection"],
    run: runWeeklyReflectionWorkflow
  },
  {
    type: "teammate_checkin",
    title: "Teammate Check-In",
    description: "Send configured teammate Slack DM check-ins and record replies.",
    aliases: ["teammate-checkin", "teammate-check-in", "checkin"],
    run: runTeammateCheckinWorkflow
  },
  {
    type: "sqlite_backup_to_s3",
    title: "SQLite Backup",
    description: "Placeholder local SQLite backup workflow without S3 upload.",
    aliases: ["backup", "sqlite-backup", "sqlite_backup_to_s3"],
    run: runBackupSqliteWorkflow
  },
  {
    type: "meta_change_request",
    title: "Meta Change Processing",
    description: "Placeholder workflow for proposed meta changes.",
    aliases: ["meta-change", "meta-change-request", "meta"],
    run: runMetaChangeRequestWorkflow
  },
  {
    type: "approval_action",
    title: "Approval Action",
    description: "Execute an approved sensitive-action stub.",
    aliases: ["approval-action", "approval_action"],
    run: runApprovalActionWorkflow
  }
];

const definitionsByType = new Map(definitions.map((definition) => [definition.type, definition]));
const aliasesByName = new Map<string, WorkflowJobType>();

for (const definition of definitions) {
  aliasesByName.set(definition.type, definition.type);

  for (const alias of definition.aliases) {
    aliasesByName.set(alias, definition.type);
  }
}

export function listWorkflows(): WorkflowDefinition[] {
  return definitions;
}

export function resolveWorkflowType(name: string): WorkflowJobType | null {
  return aliasesByName.get(name.trim().toLowerCase()) ?? null;
}

export function getWorkflowDefinition(type: WorkflowJobType | string): WorkflowDefinition | null {
  const resolvedType = resolveWorkflowType(type);

  if (!resolvedType) {
    return null;
  }

  return definitionsByType.get(resolvedType) ?? null;
}

export async function runWorkflow(
  type: WorkflowJobType | string,
  context: WorkflowContext
): Promise<WorkflowResult> {
  const definition = getWorkflowDefinition(type);

  if (!definition) {
    throw new Error(`Unknown workflow: ${type}`);
  }

  return definition.run(context);
}
