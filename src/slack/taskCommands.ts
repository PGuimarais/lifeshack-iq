import {
  assignTask,
  createTask,
  getTask,
  listOpenTasks,
  markTaskDone
} from "../services/tasks";
import { linkSlackThread, listSlackLinksForTask } from "../services/slackLinks";

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

export function formatTaskList() {
  const tasks = listOpenTasks(20);

  if (tasks.length === 0) {
    return "No open tasks.";
  }

  return [
    "*Open Tasks*",
    "",
    ...tasks.map(
      (task) =>
        `- ${task.id} [${task.priority}] ${task.name} (${task.status})`
    )
  ].join("\n");
}

export function formatTaskDetails(taskId: string) {
  const task = getTask(taskId);
  const links = listSlackLinksForTask(taskId);

  return [
    `*Task ${task.id}*`,
    "",
    `Name: ${task.name}`,
    `Status: ${task.status}`,
    `Priority: ${task.priority}`,
    `Owner: ${task.ownerPersonId ?? "unassigned"}`,
    `Issue: ${task.issueId ?? "none"}`,
    "",
    task.description ?? "No description.",
    "",
    `Slack links: ${links.length}`
  ].join("\n");
}

export function handleTaskCommand(input: {
  text: string;
  slackUserId: string;
  channelId?: string;
}) {
  const { action, rest } = split(input.text);

  if (!action || action === "help") {
    return [
      "Usage:",
      "/iq tasks",
      "/iq task create <name>",
      "/iq task show <id>",
      "/iq task assign <id> [slack_user_id]",
      "/iq task done <id>",
      "/iq task link <id> [channel_id] [thread_ts]"
    ].join("\n");
  }

  if (action === "create") {
    const task = createTask({
      name: rest,
      ownerSlackUserId: input.slackUserId
    });
    return `Created task ${task.id}.`;
  }

  if (action === "show") {
    const { id } = splitIdAndRest(rest);
    return formatTaskDetails(id);
  }

  if (action === "assign") {
    const { id, rest: assignee } = splitIdAndRest(rest);
    const task = assignTask(id, assignee || input.slackUserId);
    return `Assigned task ${task.id}.`;
  }

  if (action === "done") {
    const { id } = splitIdAndRest(rest);
    const task = markTaskDone(id, input.slackUserId);
    return `Marked task ${task.id} done.`;
  }

  if (action === "link") {
    const { id, rest: linkRest } = splitIdAndRest(rest);
    const [channelId = input.channelId, threadTs] = linkRest.split(/\s+/).filter(Boolean);

    if (!channelId) {
      return "Usage: /iq task link <id> [channel_id] [thread_ts]";
    }

    const link = linkSlackThread({
      channelId,
      threadTs,
      taskId: id
    });
    return `Linked task ${id} to Slack thread ${link.channelId}${link.threadTs ? `/${link.threadTs}` : ""}.`;
  }

  return `Unknown task command: ${action}`;
}
