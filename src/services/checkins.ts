import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  createConfigEvent,
  createId,
  jsonParseSafe,
  nowIso
} from "../db/repositories";
import { checkins, people } from "../db/schema";
import { sendSlackDm } from "../slack/notifier";
import type { CheckinScheduleConfig } from "./operatingModel";
import { listOpenTasks } from "./tasks";

export type SendCheckinInput = {
  personId: string;
  jobId?: string;
  promptText?: string;
};

function localDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function localHourMinute(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("hour")}:${byType.get("minute")}`;
}

function hasCheckinToday(personId: string, schedule: CheckinScheduleConfig, now: Date): boolean {
  const today = localDateKey(now, schedule.timezone);

  return getDb()
    .select()
    .from(checkins)
    .where(eq(checkins.personId, personId))
    .orderBy(desc(checkins.createdAt))
    .limit(10)
    .all()
    .some((checkin) => localDateKey(new Date(checkin.createdAt), schedule.timezone) === today);
}

function parseCheckinSchedule(value: string | null): CheckinScheduleConfig | null {
  return jsonParseSafe<CheckinScheduleConfig | null>(value, null);
}

export function listDueCheckinTeammates(now = new Date()) {
  return getDb()
    .select()
    .from(people)
    .where(eq(people.active, 1))
    .all()
    .filter((person) => {
      if (!person.slackUserId) {
        return false;
      }

      const schedule = parseCheckinSchedule(person.checkinScheduleJson);

      if (!schedule?.enabled) {
        return false;
      }

      if (schedule.timeOfDay > localHourMinute(now, schedule.timezone)) {
        return false;
      }

      if (hasCheckinToday(person.id, schedule, now)) {
        return false;
      }

      return true;
    });
}

export function buildCheckinPrompt(input: {
  teammateName: string;
  openTaskCount: number;
}): string {
  return [
    `Good morning ${input.teammateName}. Quick LifeShack IQ check-in:`,
    "",
    "1. What did you move forward since the last check-in?",
    "2. What is blocked or needs attention?",
    "3. Is there anything IQ should turn into a task, issue, or approval request?",
    "",
    input.openTaskCount > 0
      ? `I see ${input.openTaskCount} open task(s) in the system for follow-up context.`
      : "I do not see open tasks assigned to you yet."
  ].join("\n");
}

export async function sendTeammateCheckin(input: SendCheckinInput) {
  const person = getDb()
    .select()
    .from(people)
    .where(eq(people.id, input.personId))
    .limit(1)
    .get();

  if (!person) {
    throw new Error(`Teammate not found: ${input.personId}`);
  }

  if (!person.slackUserId) {
    throw new Error(`Teammate ${person.name} does not have a Slack user ID.`);
  }

  const openTaskCount = listOpenTasks(100).filter((task) => task.ownerPersonId === person.id).length;
  const promptText =
    input.promptText ??
    buildCheckinPrompt({
      teammateName: person.name,
      openTaskCount
    });
  const dm = await sendSlackDm({
    slackUserId: person.slackUserId,
    text: promptText
  });
  const timestamp = nowIso();
  const row = {
    id: createId("checkin"),
    personId: person.id,
    jobId: input.jobId,
    channelId: dm?.channelId,
    messageTs: dm?.ts,
    status: dm ? "pending" : "not_sent",
    promptText,
    responseText: null,
    responseTs: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  getDb().insert(checkins).values(row).run();
  createConfigEvent({
    eventType: "checkin_sent",
    targetType: "checkin",
    targetId: row.id,
    after: {
      personId: person.id,
      status: row.status,
      slackSent: Boolean(dm)
    }
  });
  return row;
}

export async function sendDueTeammateCheckins(input: {
  jobId?: string;
  personId?: string;
  scheduled?: boolean;
} = {}) {
  const teammates = input.personId
    ? getDb().select().from(people).where(eq(people.id, input.personId)).all()
    : input.scheduled
      ? listDueCheckinTeammates()
      : getDb().select().from(people).where(eq(people.active, 1)).all();

  const sent = [];

  for (const teammate of teammates) {
    if (!teammate.slackUserId) {
      continue;
    }

    sent.push(await sendTeammateCheckin({ personId: teammate.id, jobId: input.jobId }));
  }

  return sent;
}

export function recordCheckinReply(input: {
  slackUserId: string;
  channelId: string;
  text: string;
  ts?: string;
}) {
  const person = getDb()
    .select()
    .from(people)
    .where(eq(people.slackUserId, input.slackUserId))
    .limit(1)
    .get();

  if (!person) {
    return null;
  }

  const pending = getDb()
    .select()
    .from(checkins)
    .where(
      and(
        eq(checkins.personId, person.id),
        eq(checkins.channelId, input.channelId),
        inArray(checkins.status, ["pending", "not_sent"])
      )
    )
    .orderBy(desc(checkins.createdAt))
    .limit(1)
    .get();

  if (!pending) {
    return null;
  }

  const timestamp = nowIso();
  getDb()
    .update(checkins)
    .set({
      status: "responded",
      responseText: input.text,
      responseTs: input.ts,
      updatedAt: timestamp
    })
    .where(eq(checkins.id, pending.id))
    .run();
  createConfigEvent({
    eventType: "checkin_reply_recorded",
    actorSlackUserId: input.slackUserId,
    targetType: "checkin",
    targetId: pending.id,
    after: {
      responseTs: input.ts
    }
  });

  return getDb().select().from(checkins).where(eq(checkins.id, pending.id)).get();
}
