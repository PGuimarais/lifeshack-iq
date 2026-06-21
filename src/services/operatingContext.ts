import { desc } from "drizzle-orm";
import {
  createDailySnapshot,
  listRecentDailySnapshots,
  type PersistedDailySnapshot
} from "../data/snapshots/createDailySnapshot";
import { loadLatestSnapshot } from "../data/snapshots/loadLatestSnapshot";
import { getDb } from "../db/client";
import { jsonParseSafe } from "../db/repositories";
import {
  checkins,
  configEvents,
  granolaTranscripts,
  people
} from "../db/schema";
import { listRecentContextEntries } from "./contextEntries";
import { listOpenIssues } from "./issues";
import { listGoals, listInitiatives, listTeammates } from "./operatingModel";
import { listTasks } from "./tasks";

export type OperatingContextInput = {
  createFreshSnapshot?: boolean;
  snapshotLimit?: number;
  recentLimit?: number;
};

function personNameById() {
  return new Map(
    getDb()
      .select({
        id: people.id,
        name: people.name,
        slackUserId: people.slackUserId
      })
      .from(people)
      .all()
      .map((person) => [person.id, person])
  );
}

export function listRecentCheckins(limit = 50) {
  const peopleById = personNameById();

  return getDb()
    .select()
    .from(checkins)
    .orderBy(desc(checkins.createdAt))
    .limit(limit)
    .all()
    .map((checkin) => ({
      id: checkin.id,
      personId: checkin.personId,
      teammate: checkin.personId ? peopleById.get(checkin.personId) ?? null : null,
      status: checkin.status,
      promptText: checkin.promptText,
      responseText: checkin.responseText,
      responseTs: checkin.responseTs,
      createdAt: checkin.createdAt,
      updatedAt: checkin.updatedAt
    }));
}

export function listRecentGranolaTranscripts(limit = 50) {
  return getDb()
    .select()
    .from(granolaTranscripts)
    .orderBy(desc(granolaTranscripts.createdAt))
    .limit(limit)
    .all()
    .map((transcript) => ({
      id: transcript.id,
      title: transcript.title,
      processingStatus: transcript.processingStatus,
      summary: transcript.summary,
      agentRunId: transcript.agentRunId,
      capturedBySlackUserId: transcript.capturedBySlackUserId,
      sourceChannelId: transcript.sourceChannelId,
      createdAt: transcript.createdAt,
      updatedAt: transcript.updatedAt
    }));
}

export function listRecentOperatingEvents(limit = 100) {
  return getDb()
    .select()
    .from(configEvents)
    .orderBy(desc(configEvents.createdAt))
    .limit(limit)
    .all()
    .map((event) => ({
      id: event.id,
      eventType: event.eventType,
      actorSlackUserId: event.actorSlackUserId,
      targetType: event.targetType,
      targetId: event.targetId,
      before: jsonParseSafe(event.beforeJson, null),
      after: jsonParseSafe(event.afterJson, null),
      createdAt: event.createdAt
    }));
}

export async function buildOperatingContext(input: OperatingContextInput = {}) {
  const recentLimit = input.recentLimit ?? 50;
  const currentSnapshot: PersistedDailySnapshot | null = input.createFreshSnapshot
    ? await createDailySnapshot()
    : await loadLatestSnapshot({ createIfMissing: false });

  return {
    currentSnapshot,
    recentSnapshots: listRecentDailySnapshots(input.snapshotLimit ?? 7),
    teammates: listTeammates({ activeOnly: true, limit: 100 }),
    goals: listGoals({ limit: 100 }),
    initiatives: listInitiatives({ limit: 100 }),
    tasks: {
      open: listTasks({ statuses: ["open", "in_progress", "blocked"], limit: 100 }),
      recentlyClosed: listTasks({ statuses: ["done", "cancelled"], limit: 100 })
    },
    issues: listOpenIssues({ includeSnoozed: true, limit: 100 }),
    checkins: listRecentCheckins(recentLimit),
    granolaTranscripts: listRecentGranolaTranscripts(recentLimit),
    contextEntries: listRecentContextEntries(recentLimit),
    recentOperatingEvents: listRecentOperatingEvents(100)
  };
}
