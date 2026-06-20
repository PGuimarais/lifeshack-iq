import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assignIssue,
  createTaskFromIssue,
  listOpenIssues,
  resolveIssue,
  snoozeIssue
} from "../src/services/issues";
import { linkSlackThread, listSlackLinksForIssue } from "../src/services/slackLinks";
import { upsertIssuesForFindings } from "../src/rules/issueMatching";
import type { CriticalIssueFinding } from "../src/rules/types";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

const finding: CriticalIssueFinding = {
  ruleId: "test_issue",
  issueKey: "test_issue:one",
  title: "Test issue",
  description: "A test issue.",
  severity: "critical",
  area: "test",
  evidence: { issueKey: "test_issue:one" },
  recommendation: "Handle it."
};

describe("issues service", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("issues");
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("lists, assigns, snoozes, resolves, links, and creates tasks from issues", () => {
    const [{ issue }] = upsertIssuesForFindings([finding]);

    expect(listOpenIssues()).toHaveLength(1);

    const assigned = assignIssue(issue.id, "U123");
    const snoozed = snoozeIssue(issue.id, { untilIso: "2999-01-01T00:00:00.000Z" });
    const task = createTaskFromIssue(issue.id, { ownerSlackUserId: "U123" });
    linkSlackThread({ channelId: "C123", threadTs: "123.456", issueId: issue.id });
    const resolved = resolveIssue(issue.id, "U123");

    expect(assigned.ownerPersonId).toBeTruthy();
    expect(snoozed.snoozedUntil).toBe("2999-01-01T00:00:00.000Z");
    expect(listOpenIssues()).toHaveLength(0);
    expect(task.issueId).toBe(issue.id);
    expect(listSlackLinksForIssue(issue.id)).toHaveLength(1);
    expect(resolved.status).toBe("resolved");
  });
});
