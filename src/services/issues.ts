import { asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "../db/client";
import { createConfigEvent, nowIso } from "../db/repositories";
import { issues } from "../db/schema";
import { createTask } from "./tasks";
import { getOrCreatePersonForSlackUser } from "./slackLinks";

export type IssueStatus = "open" | "resolved" | "will_handle_later" | "closed";

export function listOpenIssues(input: { includeSnoozed?: boolean; limit?: number } = {}) {
  const now = nowIso();
  const snoozeClause = input.includeSnoozed
    ? undefined
    : or(isNull(issues.snoozedUntil), lte(issues.snoozedUntil, now));
  const whereClause = snoozeClause
    ? inArray(issues.status, ["open", "will_handle_later"])
    : inArray(issues.status, ["open", "will_handle_later"]);

  let rows = getDb()
    .select()
    .from(issues)
    .where(whereClause)
    .orderBy(asc(issues.createdAt))
    .limit(input.limit ?? 20)
    .all();

  if (!input.includeSnoozed) {
    rows = rows.filter((issue) => !issue.snoozedUntil || issue.snoozedUntil <= now);
  }

  return rows;
}

export function getIssue(issueId: string) {
  const issue = getDb()
    .select()
    .from(issues)
    .where(eq(issues.id, issueId))
    .limit(1)
    .get();

  if (!issue) {
    throw new Error(`Issue not found: ${issueId}`);
  }

  return issue;
}

export function assignIssue(issueId: string, slackUserId: string) {
  const person = getOrCreatePersonForSlackUser(slackUserId);
  const timestamp = nowIso();
  getDb()
    .update(issues)
    .set({
      ownerPersonId: person.id,
      updatedAt: timestamp
    })
    .where(eq(issues.id, issueId))
    .run();
  createConfigEvent({
    eventType: "issue_assigned",
    actorSlackUserId: slackUserId,
    targetType: "issue",
    targetId: issueId,
    after: {
      ownerPersonId: person.id
    }
  });
  return getIssue(issueId);
}

export function snoozeIssue(issueId: string, input: { hours?: number; untilIso?: string } = {}) {
  const hours = input.hours ?? 24;
  const snoozedUntil =
    input.untilIso ?? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const timestamp = nowIso();

  getDb()
    .update(issues)
    .set({
      snoozedUntil,
      status: "will_handle_later",
      updatedAt: timestamp
    })
    .where(eq(issues.id, issueId))
    .run();
  createConfigEvent({
    eventType: "issue_snoozed",
    targetType: "issue",
    targetId: issueId,
    after: {
      snoozedUntil
    }
  });
  return getIssue(issueId);
}

export function resolveIssue(issueId: string, actorSlackUserId?: string) {
  const timestamp = nowIso();
  getDb()
    .update(issues)
    .set({
      status: "resolved",
      updatedAt: timestamp
    })
    .where(eq(issues.id, issueId))
    .run();
  createConfigEvent({
    eventType: "issue_resolved",
    actorSlackUserId,
    targetType: "issue",
    targetId: issueId,
    after: {
      status: "resolved"
    }
  });
  return getIssue(issueId);
}

export function createTaskFromIssue(
  issueId: string,
  input: { name?: string; ownerSlackUserId?: string } = {}
) {
  const issue = getIssue(issueId);
  return createTask({
    issueId,
    ownerSlackUserId: input.ownerSlackUserId,
    priority: issue.severity === "critical" ? "critical" : "medium",
    name: input.name ?? `Handle issue: ${issue.title}`,
    description: issue.description ?? undefined,
    notes: issue.notes ?? undefined,
    links: {
      issueId
    }
  });
}
