import type { App } from "@slack/bolt";
import { loadConfig } from "../config/env";
import { enqueueJob, getQueueStats } from "../db/queue";
import { getRuntimeDbSummary } from "../db/repositories";
import { logger } from "../logger/logger";
import { executeApprovedAction } from "../services/actionExecutor";
import {
  approveApproval,
  createApprovalRequest,
  rejectApproval
} from "../services/approvals";
import { formatBackupStatus } from "../services/backups";
import {
  getMetaHistory,
  learnMetaInstruction,
  rollbackMetaTarget,
  setMetaTarget,
  showMetaControlPlane
} from "../services/metaConfig";
import { checkOperationalReadiness, formatReadiness } from "../services/readiness";
import { getRuntimeStatus } from "../services/runtimeStatus";
import { listWorkflows, resolveWorkflowType } from "../services/workflowRegistry";
import {
  formatIqHelp,
  formatIqStatus,
  formatMetaHistory,
  formatMetaConfigSummary,
  formatMetaLearnRecorded,
  formatMetaLearnUsage,
  formatMetaRollbackResult,
  formatMetaRollbackUsage,
  formatMetaSetResult,
  formatMetaSetUsage,
  formatUnknownWorkflow,
  formatWorkflowList,
  formatWorkflowQueued,
  safeErrorMessage
} from "./messages";
import {
  buildApprovalRequestBlocks,
  formatApprovalDetails,
  formatApprovalList
} from "./approvalMessages";
import {
  formatAddGranolaUsage,
  handleAddGranolaCommand
} from "./granolaCommands";
import { formatIssueList, handleIssueCommand } from "./issueCommands";
import {
  formatGoalList,
  formatInitiativeList,
  formatTeammateList,
  handleGoalCommand,
  handleInitiativeCommand,
  handleTeammateCommand
} from "./operatingModelCommands";
import { handleScheduleCommand } from "./scheduleCommands";
import { formatTaskList, handleTaskCommand } from "./taskCommands";

function splitCommandText(text: string | undefined): { action: string; rest: string } {
  const normalized = (text ?? "").trim();

  if (!normalized) {
    return { action: "", rest: "" };
  }

  const [action = "", ...rest] = normalized.split(/\s+/);
  return { action: action.toLowerCase(), rest: rest.join(" ").trim() };
}

function splitTargetAndValue(text: string): { target: string; value: string } {
  const [target = "", ...valueParts] = text.trim().split(/\s+/);
  return {
    target,
    value: valueParts.join(" ").trim()
  };
}

function handleApprovalCommand(
  text: string,
  slackUserId: string
): string | { text: string; blocks: ReturnType<typeof buildApprovalRequestBlocks> } {
  const { action, rest } = splitCommandText(text);

  if (!action || action === "help") {
    return [
      "Usage:",
      "/iq approvals",
      "/iq approval request <action_type> <message>",
      "/iq approval show <id>",
      "/iq approval approve <id>",
      "/iq approval reject <id>"
    ].join("\n");
  }

  if (action === "request") {
    const { action: actionType, rest: message } = splitCommandText(rest);

    if (!actionType) {
      return "Usage: /iq approval request <action_type> <message>";
    }

    const approval = createApprovalRequest({
      actionType,
      requestMessage: message || `Approve ${actionType}?`,
      requestedFromSlackUserId: slackUserId,
      actionPayload: {
        requestedBySlackUserId: slackUserId,
        message
      }
    });
    return {
      text: `Created approval request ${approval.id}.`,
      blocks: buildApprovalRequestBlocks(approval)
    };
  }

  if (action === "show") {
    return formatApprovalDetails(rest.trim());
  }

  if (action === "approve") {
    const approval = approveApproval(rest.trim(), slackUserId);
    const result = executeApprovedAction(approval.id);
    return `${result.message} Approval ${approval.id} approved.`;
  }

  if (action === "reject") {
    const approval = rejectApproval(rest.trim(), slackUserId);
    return `Rejected approval ${approval.id}.`;
  }

  return `Unknown approval command: ${action}`;
}

export function registerCommandHandlers(app: App): void {
  app.command("/iq", async ({ command, ack, respond }) => {
    await ack();

    try {
      const { action, rest } = splitCommandText(command.text);

      if (action === "status") {
        const [runtimeStatus, runtimeDbSummary] = await Promise.all([
          getRuntimeStatus(),
          Promise.resolve(getRuntimeDbSummary())
        ]);
        await respond(
          formatIqStatus(
            runtimeStatus,
            loadConfig(),
            runtimeDbSummary.lastBackupRun,
            getQueueStats()
          )
        );
        return;
      }

      if (action === "readiness") {
        await respond(formatReadiness(await checkOperationalReadiness()));
        return;
      }

      if (action === "workflows") {
        await respond(formatWorkflowList(listWorkflows()));
        return;
      }

      if (action === "schedule") {
        await respond(handleScheduleCommand(rest, command.user_id));
        return;
      }

      if (action === "teammates") {
        await respond(formatTeammateList());
        return;
      }

      if (action === "teammate") {
        await respond(handleTeammateCommand(rest, command.user_id));
        return;
      }

      if (action === "goals") {
        await respond(formatGoalList());
        return;
      }

      if (action === "goal") {
        await respond(handleGoalCommand(rest, command.user_id));
        return;
      }

      if (action === "initiatives") {
        await respond(formatInitiativeList());
        return;
      }

      if (action === "initiative") {
        await respond(handleInitiativeCommand(rest, command.user_id));
        return;
      }

      if (action === "issues") {
        await respond(formatIssueList());
        return;
      }

      if (action === "issue") {
        await respond(
          handleIssueCommand({
            text: rest,
            slackUserId: command.user_id,
            channelId: command.channel_id
          })
        );
        return;
      }

      if (action === "tasks") {
        await respond(formatTaskList());
        return;
      }

      if (action === "task") {
        await respond(
          handleTaskCommand({
            text: rest,
            slackUserId: command.user_id,
            channelId: command.channel_id
          })
        );
        return;
      }

      if (action === "approvals") {
        await respond(formatApprovalList());
        return;
      }

      if (action === "approval") {
        await respond(handleApprovalCommand(rest, command.user_id));
        return;
      }

      if (action === "backup") {
        const { action: backupAction } = splitCommandText(rest);

        if (backupAction === "status" || !backupAction) {
          await respond(formatBackupStatus());
          return;
        }

        await respond("Usage: /iq backup status");
        return;
      }

      if (action === "run") {
        const { action: workflowName, rest: workflowArgs } = splitCommandText(rest);

        if (!workflowName) {
          await respond("Usage: /iq run <workflow>");
          return;
        }

        const workflowType = resolveWorkflowType(workflowName);

        if (!workflowType) {
          await respond(formatUnknownWorkflow(workflowName));
          return;
        }

        const job = enqueueJob({
          type: workflowType,
          payload: {
            source: "slack",
            requestedBySlackUserId: command.user_id,
            text: command.text,
            useAgent: workflowArgs.split(/\s+/).includes("--agent")
          }
        });
        await respond(formatWorkflowQueued(job, workflowName));
        return;
      }

      await respond(formatIqHelp());
    } catch (error) {
      logger.error({ err: error }, "Failed to handle /iq command");
      await respond(safeErrorMessage);
    }
  });

  app.command("/add-granola", async ({ command, ack, respond }) => {
    await ack();

    try {
      if (!command.text.trim()) {
        await respond(formatAddGranolaUsage());
        return;
      }

      await respond("Got it. Processing the Granola transcript now.");
      await respond(
        await handleAddGranolaCommand({
          text: command.text,
          slackUserId: command.user_id,
          channelId: command.channel_id
        })
      );
    } catch (error) {
      logger.error({ err: error }, "Failed to handle /add-granola command");
      await respond(safeErrorMessage);
    }
  });

  app.command("/meta", async ({ command, ack, respond }) => {
    await ack();

    try {
      const { action, rest } = splitCommandText(command.text);

      if (action === "show" || action === "") {
        const summary = showMetaControlPlane();
        await respond(formatMetaConfigSummary(summary.configs, summary.promptModules));
        return;
      }

      if (action === "learn") {
        if (!rest) {
          await respond(formatMetaLearnUsage());
          return;
        }

        learnMetaInstruction(rest, command.user_id);
        await respond(formatMetaLearnRecorded(rest));
        return;
      }

      if (action === "set") {
        const { target, value } = splitTargetAndValue(rest);

        if (!target || !value) {
          await respond(formatMetaSetUsage());
          return;
        }

        const result = setMetaTarget(target, value, command.user_id);
        await respond(formatMetaSetResult(result));
        return;
      }

      if (action === "history") {
        await respond(formatMetaHistory(getMetaHistory(10)));
        return;
      }

      if (action === "rollback") {
        const { target, value } = splitTargetAndValue(rest);
        const versionNumber = Number(value);

        if (!target || !Number.isInteger(versionNumber) || versionNumber < 1) {
          await respond(formatMetaRollbackUsage());
          return;
        }

        const result = rollbackMetaTarget(target, versionNumber, command.user_id);
        await respond(formatMetaRollbackResult(result));
        return;
      }

      await respond(formatIqHelp());
    } catch (error) {
      logger.error({ err: error }, "Failed to handle /meta command");
      await respond(safeErrorMessage);
    }
  });
}
