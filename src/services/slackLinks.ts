import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { createId, nowIso } from "../db/repositories";
import { people, slackThreads } from "../db/schema";

export function getOrCreatePersonForSlackUser(slackUserId: string, name?: string) {
  const db = getDb();
  const existing = db
    .select()
    .from(people)
    .where(eq(people.slackUserId, slackUserId))
    .limit(1)
    .get();

  if (existing) {
    return existing;
  }

  const timestamp = nowIso();
  const row = {
    id: createId("person"),
    name: name ?? slackUserId,
    slackUserId,
    role: null,
    strengthsJson: null,
    weaknessesJson: null,
    checkinScheduleJson: null,
    active: 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  db.insert(people).values(row).run();
  return row;
}

export type SlackThreadLinkInput = {
  channelId: string;
  threadTs?: string;
  issueId?: string;
  taskId?: string;
  agentRunId?: string;
};

export function linkSlackThread(input: SlackThreadLinkInput) {
  const timestamp = nowIso();
  const row = {
    id: createId("slack"),
    channelId: input.channelId,
    threadTs: input.threadTs,
    relatedIssueId: input.issueId,
    relatedTaskId: input.taskId,
    relatedAgentRunId: input.agentRunId,
    createdAt: timestamp
  };

  getDb().insert(slackThreads).values(row).run();
  return row;
}

export function findSlackThreadLink(input: {
  channelId: string;
  threadTs?: string;
}) {
  const threadClause = input.threadTs
    ? eq(slackThreads.threadTs, input.threadTs)
    : isNull(slackThreads.threadTs);

  return getDb()
    .select()
    .from(slackThreads)
    .where(
      and(
        eq(slackThreads.channelId, input.channelId),
        threadClause
      )
    )
    .limit(1)
    .get() ?? null;
}

export function listSlackLinksForIssue(issueId: string) {
  return getDb()
    .select()
    .from(slackThreads)
    .where(eq(slackThreads.relatedIssueId, issueId))
    .all();
}

export function listSlackLinksForTask(taskId: string) {
  return getDb()
    .select()
    .from(slackThreads)
    .where(eq(slackThreads.relatedTaskId, taskId))
    .all();
}
