import type { App } from "@slack/bolt";
import { executeApprovedAction } from "../services/actionExecutor";
import { approveApproval, rejectApproval } from "../services/approvals";
import {
  assignIssue,
  createTaskFromIssue,
  resolveIssue,
  snoozeIssue
} from "../services/issues";
import { assignTask, markTaskDone } from "../services/tasks";

export type SlackButtonResult = {
  text: string;
};

export function getActionValue(action: unknown): string | undefined {
  return action &&
    typeof action === "object" &&
    "value" in action &&
    typeof action.value === "string"
    ? action.value
    : undefined;
}

export function getActorSlackUserId(body: unknown): string | undefined {
  return body &&
    typeof body === "object" &&
    "user" in body &&
    body.user &&
    typeof body.user === "object" &&
    "id" in body.user &&
    typeof body.user.id === "string"
    ? body.user.id
    : undefined;
}

export function handleIssueButtonAction(input: {
  actionId: string;
  issueId: string;
  slackUserId: string;
}): SlackButtonResult {
  if (input.actionId === "issue_create_task") {
    const task = createTaskFromIssue(input.issueId, {
      ownerSlackUserId: input.slackUserId
    });
    return { text: `Created task ${task.id} from issue ${input.issueId}.` };
  }

  if (input.actionId === "issue_assign_self") {
    assignIssue(input.issueId, input.slackUserId);
    return { text: `Assigned issue ${input.issueId} to you.` };
  }

  if (input.actionId === "issue_snooze") {
    const issue = snoozeIssue(input.issueId, { hours: 24 });
    return { text: `Snoozed issue ${input.issueId} until ${issue.snoozedUntil}.` };
  }

  if (input.actionId === "issue_resolve") {
    resolveIssue(input.issueId, input.slackUserId);
    return { text: `Resolved issue ${input.issueId}.` };
  }

  throw new Error(`Unknown issue action: ${input.actionId}`);
}

export function handleTaskButtonAction(input: {
  actionId: string;
  taskId: string;
  slackUserId: string;
}): SlackButtonResult {
  if (input.actionId === "task_assign_self") {
    assignTask(input.taskId, input.slackUserId);
    return { text: `Assigned task ${input.taskId} to you.` };
  }

  if (input.actionId === "task_mark_done") {
    markTaskDone(input.taskId, input.slackUserId);
    return { text: `Marked task ${input.taskId} done.` };
  }

  throw new Error(`Unknown task action: ${input.actionId}`);
}

export function handleApprovalButtonAction(input: {
  actionId: string;
  approvalId: string;
  slackUserId: string;
}): SlackButtonResult {
  if (input.actionId === "approval_approve") {
    approveApproval(input.approvalId, input.slackUserId);
    const result = executeApprovedAction(input.approvalId);
    return { text: `${result.message} Approval ${input.approvalId} approved.` };
  }

  if (input.actionId === "approval_reject") {
    rejectApproval(input.approvalId, input.slackUserId);
    return { text: `Rejected approval ${input.approvalId}.` };
  }

  throw new Error(`Unknown approval action: ${input.actionId}`);
}

export function registerActionButtonHandlers(
  app: App,
  input: {
    onError: (error: unknown, message: string) => void;
    safeErrorMessage: string;
  }
): void {
  const issueActionIds = [
    "issue_create_task",
    "issue_assign_self",
    "issue_snooze",
    "issue_resolve"
  ];
  const taskActionIds = ["task_assign_self", "task_mark_done"];
  const approvalActionIds = ["approval_approve", "approval_reject"];

  for (const actionId of issueActionIds) {
    app.action(actionId, async ({ ack, action, body, respond }) => {
      await ack();

      try {
        const issueId = getActionValue(action);
        const slackUserId = getActorSlackUserId(body);

        if (!issueId || !slackUserId) {
          await respond?.("Missing issue id or Slack user id.");
          return;
        }

        const result = handleIssueButtonAction({ actionId, issueId, slackUserId });
        await respond?.(result.text);
      } catch (error) {
        input.onError(error, `Failed to handle issue action ${actionId}`);
        await respond?.(input.safeErrorMessage);
      }
    });
  }

  for (const actionId of taskActionIds) {
    app.action(actionId, async ({ ack, action, body, respond }) => {
      await ack();

      try {
        const taskId = getActionValue(action);
        const slackUserId = getActorSlackUserId(body);

        if (!taskId || !slackUserId) {
          await respond?.("Missing task id or Slack user id.");
          return;
        }

        const result = handleTaskButtonAction({ actionId, taskId, slackUserId });
        await respond?.(result.text);
      } catch (error) {
        input.onError(error, `Failed to handle task action ${actionId}`);
        await respond?.(input.safeErrorMessage);
      }
    });
  }

  for (const actionId of approvalActionIds) {
    app.action(actionId, async ({ ack, action, body, respond }) => {
      await ack();

      try {
        const approvalId = getActionValue(action);
        const slackUserId = getActorSlackUserId(body);

        if (!approvalId || !slackUserId) {
          await respond?.("Missing approval id or Slack user id.");
          return;
        }

        const result = handleApprovalButtonAction({ actionId, approvalId, slackUserId });
        await respond?.(result.text);
      } catch (error) {
        input.onError(error, `Failed to handle approval action ${actionId}`);
        await respond?.(input.safeErrorMessage);
      }
    });
  }
}
