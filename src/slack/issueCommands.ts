import {
  assignIssue,
  createTaskFromIssue,
  getIssue,
  listOpenIssues,
  resolveIssue,
  snoozeIssue
} from "../services/issues";
import { linkSlackThread, listSlackLinksForIssue } from "../services/slackLinks";

function split(text: string): { action: string; rest: string } {
  const [action = "", ...rest] = text.trim().split(/\s+/);
  return {
    action: action.toLowerCase(),
    rest: rest.join(" ").trim()
  };
}

function splitIdAndRest(text: string): { id: string; rest: string } {
  const [id = "", ...rest] = text.trim().split(/\s+/);
  return { id, rest: rest.join(" ").trim() };
}

export function formatIssueList() {
  const issues = listOpenIssues({ limit: 20 });

  if (issues.length === 0) {
    return "No open issues.";
  }

  return [
    "*Open Issues*",
    "",
    ...issues.map(
      (issue) =>
        `- ${issue.id} [${issue.severity}] ${issue.title} (${issue.status})`
    )
  ].join("\n");
}

export function formatIssueDetails(issueId: string) {
  const issue = getIssue(issueId);
  const links = listSlackLinksForIssue(issueId);

  return [
    `*Issue ${issue.id}*`,
    "",
    `Title: ${issue.title}`,
    `Status: ${issue.status}`,
    `Severity: ${issue.severity}`,
    `Area: ${issue.area ?? "unknown"}`,
    `Owner: ${issue.ownerPersonId ?? "unassigned"}`,
    `Snoozed until: ${issue.snoozedUntil ?? "not snoozed"}`,
    "",
    issue.description ?? "No description.",
    "",
    `Slack links: ${links.length}`
  ].join("\n");
}

export function handleIssueCommand(input: {
  text: string;
  slackUserId: string;
  channelId?: string;
}) {
  const { action, rest } = split(input.text);

  if (!action || action === "help") {
    return [
      "Usage:",
      "/iq issue show <id>",
      "/iq issue assign <id> [slack_user_id]",
      "/iq issue snooze <id> [hours]",
      "/iq issue resolve <id>",
      "/iq issue create-task <id> [task name]",
      "/iq issue link <id> [channel_id] [thread_ts]"
    ].join("\n");
  }

  if (action === "show") {
    const { id } = splitIdAndRest(rest);
    return formatIssueDetails(id);
  }

  if (action === "assign") {
    const { id, rest: assignee } = splitIdAndRest(rest);
    const issue = assignIssue(id, assignee || input.slackUserId);
    return `Assigned issue ${issue.id}.`;
  }

  if (action === "snooze") {
    const { id, rest: hoursRaw } = splitIdAndRest(rest);
    const hours = hoursRaw ? Number(hoursRaw) : 24;
    const issue = snoozeIssue(id, {
      hours: Number.isFinite(hours) && hours > 0 ? hours : 24
    });
    return `Snoozed issue ${issue.id} until ${issue.snoozedUntil}.`;
  }

  if (action === "resolve") {
    const { id } = splitIdAndRest(rest);
    const issue = resolveIssue(id, input.slackUserId);
    return `Resolved issue ${issue.id}.`;
  }

  if (action === "create-task") {
    const { id, rest: name } = splitIdAndRest(rest);
    const task = createTaskFromIssue(id, {
      name: name || undefined,
      ownerSlackUserId: input.slackUserId
    });
    return `Created task ${task.id} from issue ${id}.`;
  }

  if (action === "link") {
    const { id, rest: linkRest } = splitIdAndRest(rest);
    const [channelId = input.channelId, threadTs] = linkRest.split(/\s+/).filter(Boolean);

    if (!channelId) {
      return "Usage: /iq issue link <id> [channel_id] [thread_ts]";
    }

    const link = linkSlackThread({
      channelId,
      threadTs,
      issueId: id
    });
    return `Linked issue ${id} to Slack thread ${link.channelId}${link.threadTs ? `/${link.threadTs}` : ""}.`;
  }

  return `Unknown issue command: ${action}`;
}
