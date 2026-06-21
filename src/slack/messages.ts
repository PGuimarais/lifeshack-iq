import type { AppConfig } from "../config/env";
import type { QueueJob, JobStatus } from "../db/queue";
import type { WorkflowDefinition } from "../services/workflowRegistry";
import type { RuntimeStatus } from "../services/runtimeStatus";

type LastBackupRun = {
  status: string;
  startedAt: string;
  finishedAt: string | null;
} | null;

type MetaConfigSummary = {
  key: string;
  value: unknown;
};

type PromptModuleSummary = {
  name: string;
  activeVersionNumber: number | null;
};

type QueueStats = Record<JobStatus, number>;

export const safeErrorMessage =
  "LifeShack IQ hit an internal error while handling that command. The error was logged locally.";

export function formatIqStatus(
  status: RuntimeStatus,
  config: AppConfig,
  lastBackupRun: LastBackupRun,
  queueStats?: QueueStats
): string {
  const lastBackup = lastBackupRun
    ? `${lastBackupRun.status} at ${lastBackupRun.finishedAt ?? lastBackupRun.startedAt}`
    : "none";

  return [
    "*LifeShack IQ is online.*",
    "",
    `Runtime: ${status.runtimeMode}`,
    `Agent: ${config.agent.mode}${config.agent.mode === "fake" ? "" : ` (${config.agent.model})`}`,
    `Database: ${status.database.connected ? "connected" : "not connected"}`,
    `Slack: ${status.slack.connected ? "connected" : status.slack.configured ? "configured" : "not configured"}`,
    `OpenAI: ${config.integrations.openAiConfigured ? "configured" : "not configured"}`,
    `S3 backups: ${config.integrations.s3BackupsConfigured ? "configured" : "not configured"}`,
    `Last backup: ${lastBackup}`,
    queueStats
      ? `Queue: ${queueStats.queued} queued, ${queueStats.running} running, ${queueStats.failed} failed`
      : undefined
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatWorkflowList(workflows: WorkflowDefinition[]): string {
  return [
    "*Runnable IQ workflows:*",
    "",
    ...workflows.map((workflow) => `- ${workflow.aliases[0]} - ${workflow.description}`)
  ].join("\n");
}

export function formatIqHelp(): string {
  return [
    "*LifeShack IQ commands:*",
    "",
    "/iq status - show runtime health",
    "/iq readiness - show scheduled workflow readiness",
    "/iq help - show commands",
    "/iq run <workflow> - enqueue a workflow job",
    "/iq workflows - show runnable workflow names",
    "/iq schedule - show configured workflow schedules",
    "/iq schedule set <workflow> daily <HH:mm> [timezone] - retime a workflow",
    "/iq teammates - list teammates",
    "/iq teammate add <@user> <name> - add or update a teammate",
    "/iq teammate schedule <@user> daily <HH:mm> <timezone> - configure check-ins",
    "/iq goals - list goals",
    "/iq goal create <name> - create a goal",
    "/iq initiatives - list initiatives",
    "/iq initiative create <goal_id|none> <name> - create an initiative",
    "/iq issues - list open issues",
    "/iq issue show <id> - show issue details",
    "/iq issue assign <id> - assign an issue to yourself",
    "/iq issue snooze <id> [hours] - snooze an issue",
    "/iq issue resolve <id> - resolve an issue",
    "/iq tasks - list open tasks",
    "/iq task create <name> - create a task",
    "/iq task done <id> - mark a task done",
    "/iq approvals - list pending approvals",
    "/iq approval request <type> <message> - request approval for a sensitive action",
    "/iq approval approve <id> - approve and execute a stub handler",
    "/iq approval reject <id> - reject an approval",
    "/iq backup status - show latest SQLite backup",
    "/add-granola - paste a Granola meeting transcript for IQ to process",
    "/iq run critical-scan - enqueue deterministic critical scan",
    "/iq run critical-scan --agent - add fake-agent Slack-ready synthesis",
    "/iq run daily-report - enqueue deterministic company report",
    "/iq run daily-report --agent - add fake-agent report synthesis",
    "/iq run weekly-reflection - synthesize weekly operating context",
    "/iq run teammate-checkin - send teammate check-in DMs",
    "/iq run backup - enqueue placeholder local SQLite backup",
    "",
    "/meta show - show active meta config",
    "/meta learn <instruction> - propose an operating change",
    "/meta set <target> <json-or-text> - version config or prompt changes",
    "/meta history - show recent meta events",
    "/meta rollback <target> <version> - activate an older config or prompt version"
  ].join("\n");
}

function booleanLine(label: string, value: unknown): string | null {
  if (typeof value !== "boolean") {
    return null;
  }

  return value ? `- ${label}` : null;
}

function getConfigValue<T extends Record<string, unknown>>(
  configs: MetaConfigSummary[],
  key: string
): T {
  const found = configs.find((config) => config.key === key)?.value;
  return found && typeof found === "object" && !Array.isArray(found) ? (found as T) : ({} as T);
}

export function formatMetaConfigSummary(
  configs: MetaConfigSummary[],
  promptModules: PromptModuleSummary[]
): string {
  const reportStyle = getConfigValue(configs, "report_style");
  const safety = getConfigValue(configs, "safety");

  const reportLines = [
    booleanLine("Executive-first summaries", reportStyle.executive_first),
    booleanLine("Critical issues before detail", reportStyle.critical_issues_before_detail),
    booleanLine("Recommended actions included", reportStyle.include_recommended_actions)
  ].filter(Boolean);
  const safetyLines = [
    booleanLine("Refunds require approval", safety.refunds_require_approval),
    booleanLine("Customer emails require approval", safety.customer_emails_require_approval),
    booleanLine("Production changes require approval", safety.production_changes_require_approval),
    booleanLine("Destructive AWS actions require approval", safety.destructive_aws_actions_require_approval)
  ].filter(Boolean);
  const promptLines = promptModules.map((promptModule) => {
    const version = promptModule.activeVersionNumber
      ? ` v${promptModule.activeVersionNumber}`
      : "";
    return `- ${promptModule.name}${version}`;
  });

  return [
    "*Active Meta Configuration*",
    "",
    "Report style:",
    ...(reportLines.length ? reportLines : ["- No report style config found"]),
    "",
    "Safety:",
    ...(safetyLines.length ? safetyLines : ["- No safety config found"]),
    "",
    "Prompt modules:",
    ...(promptLines.length ? promptLines : ["- No prompt modules found"])
  ].join("\n");
}

export function formatMetaLearnRecorded(instruction: string): string {
  return [
    "*Proposed meta change recorded.*",
    "",
    "Instruction:",
    `"${instruction}"`,
    "",
    "Status: proposed",
    "Risk: unknown",
    "",
    "In a later phase, IQ will classify this, show a diff, and request approval when needed."
  ].join("\n");
}

export function formatMetaLearnUsage(): string {
  return "Usage: /meta learn <instruction>";
}

export function formatWorkflowQueued(job: QueueJob, workflowName: string): string {
  return [
    "*IQ workflow queued.*",
    "",
    `Workflow: ${workflowName}`,
    `Job: ${job.id}`,
    `Run at: ${job.runAt}`,
    `Status: ${job.status}`
  ].join("\n");
}

export function formatUnknownWorkflow(workflowName: string): string {
  return [
    `Unknown workflow: ${workflowName}`,
    "",
    "Try one of: critical-scan, daily-report, weekly-reflection, teammate-checkin, backup, meta-change."
  ].join("\n");
}

export function formatMetaSetUsage(): string {
  return [
    "Usage: /meta set <target> <json-or-text>",
    "",
    "Examples:",
    "/meta set meta.thresholds {\"critical_issue_score\":90}",
    "/meta set prompt.daily_group_report_prompt Write a concise daily report."
  ].join("\n");
}

export function formatMetaRollbackUsage(): string {
  return "Usage: /meta rollback <target> <version_number>";
}

export function formatMetaSetResult(result: {
  kind: "config" | "prompt";
  config?: { namespace: string; key: string };
  module?: { name: string };
  version?: { versionNumber: number };
}): string {
  if (result.kind === "prompt") {
    return [
      "*Prompt module updated.*",
      "",
      `Prompt: ${result.module?.name ?? "unknown"}`,
      `Version: ${result.version?.versionNumber ?? "unknown"}`
    ].join("\n");
  }

  return [
    "*Meta config updated.*",
    "",
    `Config: ${result.config?.namespace ?? "meta"}.${result.config?.key ?? "unknown"}`,
    `Version: ${result.version?.versionNumber ?? "unchanged"}`
  ].join("\n");
}

export function formatMetaRollbackResult(result: {
  kind: "config" | "prompt";
  config?: { namespace: string; key: string };
  module?: { name: string };
  version?: { versionNumber: number };
}): string {
  if (result.kind === "prompt") {
    return [
      "*Prompt module rolled back.*",
      "",
      `Prompt: ${result.module?.name ?? "unknown"}`,
      `Active version: ${result.version?.versionNumber ?? "unknown"}`
    ].join("\n");
  }

  return [
    "*Meta config rolled back.*",
    "",
    `Config: ${result.config?.namespace ?? "meta"}.${result.config?.key ?? "unknown"}`,
    `Active version: ${result.version?.versionNumber ?? "unknown"}`
  ].join("\n");
}

export function formatMetaHistory(history: {
  events: Array<{
    eventType: string;
    targetType: string | null;
    targetId: string | null;
    createdAt: string;
  }>;
  requests: Array<{
    id: string;
    requestText: string;
    status: string;
    createdAt: string;
  }>;
}): string {
  const eventLines = history.events.slice(0, 6).map((event) => {
    const target = event.targetType ? ` ${event.targetType}:${event.targetId ?? "unknown"}` : "";
    return `- ${event.createdAt} ${event.eventType}${target}`;
  });
  const requestLines = history.requests.slice(0, 6).map((request) => {
    return `- ${request.createdAt} ${request.status} ${request.id}: ${request.requestText}`;
  });

  return [
    "*Meta History*",
    "",
    "Recent events:",
    ...(eventLines.length ? eventLines : ["- none"]),
    "",
    "Recent requests:",
    ...(requestLines.length ? requestLines : ["- none"])
  ].join("\n");
}

export function formatMetaActionResult(action: "applied" | "cancelled", id: string): string {
  return `Meta change request ${id} ${action}.`;
}
