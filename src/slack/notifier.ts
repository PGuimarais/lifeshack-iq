import type { App } from "@slack/bolt";
import type { WorkflowJobType } from "../db/queue";
import { logger } from "../logger/logger";
import type { WorkflowResult } from "../services/workflowRegistry";

let slackApp: App | null = null;

const workflowTitles: Record<WorkflowJobType, string> = {
  daily_critical_scan: "Daily Critical Scan",
  daily_group_report: "Daily Group Report",
  weekly_reflection: "Weekly Reflection",
  teammate_checkin: "Teammate Check-In",
  sqlite_backup_to_s3: "SQLite Backup",
  meta_change_request: "Meta Change Processing",
  approval_action: "Approval Action"
};

export function configureSlackNotifier(app: App | null): void {
  slackApp = app;
}

export function getNotificationChannel(type: WorkflowJobType): string | undefined {
  if (type === "daily_critical_scan") {
    return process.env.IQ_CRITICAL_ALERT_CHANNEL_ID || process.env.IQ_DAILY_UPDATE_CHANNEL_ID;
  }

  if (type === "weekly_reflection") {
    return process.env.IQ_WEEKLY_REFLECTION_CHANNEL_ID || process.env.IQ_DAILY_UPDATE_CHANNEL_ID;
  }

  if (type === "daily_group_report") {
    return process.env.IQ_DAILY_UPDATE_CHANNEL_ID;
  }

  return undefined;
}

export function formatWorkflowNotification(result: WorkflowResult): string {
  return [
    `*LifeShack IQ: ${workflowTitles[result.workflowType] ?? result.workflowType}*`,
    "",
    result.summary
  ].join("\n");
}

export async function notifyWorkflowResult(result: WorkflowResult): Promise<void> {
  const channel = getNotificationChannel(result.workflowType);

  if (!slackApp || !channel) {
    return;
  }

  await slackApp.client.chat.postMessage({
    channel,
    text: formatWorkflowNotification(result),
    unfurl_links: false,
    unfurl_media: false
  });

  logger.info(
    { workflowType: result.workflowType, channel },
    "Posted IQ workflow notification to Slack."
  );
}

export async function sendSlackDm(input: {
  slackUserId: string;
  text: string;
}): Promise<{ channelId: string; ts: string } | null> {
  if (!slackApp) {
    return null;
  }

  const opened = await slackApp.client.conversations.open({
    users: input.slackUserId
  });
  const channelId = opened.channel?.id;

  if (!channelId) {
    throw new Error(`Could not open Slack DM for ${input.slackUserId}.`);
  }

  const posted = await slackApp.client.chat.postMessage({
    channel: channelId,
    text: input.text,
    unfurl_links: false,
    unfurl_media: false
  });

  if (!posted.ts) {
    throw new Error(`Could not post Slack DM for ${input.slackUserId}.`);
  }

  return {
    channelId,
    ts: posted.ts
  };
}
