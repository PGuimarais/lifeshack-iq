import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  handleApprovalButtonAction,
  handleIssueButtonAction,
  handleTaskButtonAction
} from "../src/slack/actionButtons";
import { createApprovalRequest } from "../src/services/approvals";
import { getApproval } from "../src/services/approvals";
import { getIssue } from "../src/services/issues";
import { createTask, getTask, listOpenTasks } from "../src/services/tasks";
import { upsertIssuesForFindings } from "../src/rules/issueMatching";
import type { CriticalIssueFinding } from "../src/rules/types";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

const finding: CriticalIssueFinding = {
  ruleId: "slack_action_issue",
  issueKey: "slack_action_issue:one",
  title: "Slack action issue",
  description: "A button action issue.",
  severity: "medium",
  area: "test",
  evidence: { issueKey: "slack_action_issue:one" },
  recommendation: "Click a button."
};

describe("Slack action handlers", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("slack-actions");
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("handles issue, task, and approval button actions", () => {
    const [{ issue }] = upsertIssuesForFindings([finding]);
    const task = createTask({ name: "Button task" });
    const approval = createApprovalRequest({
      actionType: "refund",
      requestMessage: "Refund?",
      actionPayload: { amountCents: 1000 }
    });

    const taskResult = handleIssueButtonAction({
      actionId: "issue_create_task",
      issueId: issue.id,
      slackUserId: "U123"
    });
    handleIssueButtonAction({
      actionId: "issue_assign_self",
      issueId: issue.id,
      slackUserId: "U123"
    });
    handleIssueButtonAction({
      actionId: "issue_snooze",
      issueId: issue.id,
      slackUserId: "U123"
    });
    handleIssueButtonAction({
      actionId: "issue_resolve",
      issueId: issue.id,
      slackUserId: "U123"
    });
    handleTaskButtonAction({
      actionId: "task_assign_self",
      taskId: task.id,
      slackUserId: "U123"
    });
    handleTaskButtonAction({
      actionId: "task_mark_done",
      taskId: task.id,
      slackUserId: "U123"
    });
    const approvalResult = handleApprovalButtonAction({
      actionId: "approval_approve",
      approvalId: approval.id,
      slackUserId: "U123"
    });

    expect(taskResult.text).toContain("Created task");
    expect(listOpenTasks().some((row) => row.issueId === issue.id)).toBe(true);
    expect(getIssue(issue.id).status).toBe("resolved");
    expect(getTask(task.id).status).toBe("done");
    expect(getApproval(approval.id).status).toBe("approved");
    expect(approvalResult.text).toContain("stub");
  });
});
