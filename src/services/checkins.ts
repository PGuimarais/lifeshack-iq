import { and, desc, eq, inArray } from "drizzle-orm";
import type { ModelClient } from "../agents/modelClient";
import { runAgent } from "../agents/runAgent";
import {
  checkinReplyOutputSchema,
  type CheckinReplyOutput
} from "../agents/schemas";
import { getDb } from "../db/client";
import {
  createConfigEvent,
  createId,
  jsonParseSafe,
  nowIso
} from "../db/repositories";
import { checkins, people } from "../db/schema";
import { sendSlackDm } from "../slack/notifier";
import {
  createContextEntry,
  listContextEntriesForSource
} from "./contextEntries";
import { buildOperatingContext } from "./operatingContext";
import type { CheckinScheduleConfig } from "./operatingModel";
import { listOpenTasks } from "./tasks";

export type SendCheckinInput = {
  personId: string;
  jobId?: string;
  promptText?: string;
};

export type CheckinReplyInterpretationResult = {
  checkin: typeof checkins.$inferSelect;
  output: CheckinReplyOutput;
  toolCalls: Array<{
    name: string;
    arguments: unknown;
    output: unknown;
  }>;
  contextEntries: Array<ReturnType<typeof listContextEntriesForSource>[number]>;
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

function getCheckin(checkinId: string) {
  const checkin = getDb()
    .select()
    .from(checkins)
    .where(eq(checkins.id, checkinId))
    .limit(1)
    .get();

  if (!checkin) {
    throw new Error(`Check-in not found: ${checkinId}`);
  }

  return checkin;
}

function getPersonForCheckin(checkin: typeof checkins.$inferSelect) {
  if (!checkin.personId) {
    throw new Error(`Check-in ${checkin.id} is not linked to a teammate.`);
  }

  const person = getDb()
    .select()
    .from(people)
    .where(eq(people.id, checkin.personId))
    .limit(1)
    .get();

  if (!person) {
    throw new Error(`Teammate not found for check-in ${checkin.id}.`);
  }

  return person;
}

function formatCheckinContextBody(output: CheckinReplyOutput): string {
  const sections: Array<{ label: string; values: string[] }> = [
    { label: "Summary", values: [output.summary] },
    { label: "Progress", values: output.progressUpdates },
    { label: "Blockers", values: output.blockers },
    { label: "Action items", values: output.actionItems },
    { label: "Goal or initiative updates", values: output.goalOrInitiativeUpdates },
    { label: "Approvals needed", values: output.approvalsNeeded },
    { label: "Follow-ups", values: output.followUps }
  ];

  return sections
    .filter(({ values }) => values.length > 0)
    .map(({ label, values }) => `${label}:\n${values.map((value) => `- ${value}`).join("\n")}`)
    .join("\n\n");
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

export async function interpretCheckinReply(input: {
  checkinId: string;
  client?: ModelClient;
}): Promise<CheckinReplyInterpretationResult> {
  const checkin = getCheckin(input.checkinId);
  const person = getPersonForCheckin(checkin);

  if (!checkin.responseText?.trim()) {
    throw new Error(`Check-in ${checkin.id} does not have a reply to interpret.`);
  }

  const operatingContext = await buildOperatingContext({
    createFreshSnapshot: false,
    snapshotLimit: 7,
    recentLimit: 50
  });
  const result = await runAgent({
    workflowType: "teammate_checkin_reply",
    promptModuleName: "teammate_checkin_reply_prompt",
    input: {
      checkin: {
        id: checkin.id,
        promptText: checkin.promptText,
        responseText: checkin.responseText,
        responseTs: checkin.responseTs,
        status: checkin.status,
        createdAt: checkin.createdAt
      },
      teammate: {
        id: person.id,
        name: person.name,
        slackUserId: person.slackUserId,
        role: person.role,
        strengths: jsonParseSafe<string[]>(person.strengthsJson, []),
        weaknesses: jsonParseSafe<string[]>(person.weaknessesJson, [])
      },
      operatingContext,
      guidance: [
        "Update tasks, goals, initiatives, and context only when the teammate reply clearly supports it.",
        "Use create_task for concrete follow-up work, create_initiative for new workstreams, propose_goal or update_goal for explicit goal changes, record_context_note for durable context, and request_approval for sensitive external actions.",
        "Do not execute sensitive external actions."
      ]
    },
    outputSchema: checkinReplyOutputSchema,
    client: input.client
  });
  const recordedContext = result.toolCalls.some((call) => call.name === "record_context_note");

  if (!recordedContext) {
    createContextEntry({
      sourceType: "checkin_reply",
      sourceId: checkin.id,
      title: `Check-in summary: ${person.name}`,
      body: formatCheckinContextBody(result.output),
      tags: ["checkin", "teammate", person.name],
      importance: result.output.status === "needs_review" || result.output.blockers.length > 0
        ? "high"
        : "medium"
    }, person.slackUserId ?? undefined);
  }

  const timestamp = nowIso();
  getDb()
    .update(checkins)
    .set({
      status: result.output.status === "needs_review" ? "needs_review" : "interpreted",
      updatedAt: timestamp
    })
    .where(eq(checkins.id, checkin.id))
    .run();
  createConfigEvent({
    eventType: "checkin_reply_interpreted",
    actorSlackUserId: person.slackUserId ?? undefined,
    targetType: "checkin",
    targetId: checkin.id,
    after: {
      status: result.output.status,
      agentRunId: result.agentRunId,
      toolCalls: result.toolCalls.map((call) => call.name)
    }
  });

  return {
    checkin: getCheckin(checkin.id),
    output: result.output,
    toolCalls: result.toolCalls,
    contextEntries: [
      ...listContextEntriesForSource("checkin_reply", checkin.id),
      ...listContextEntriesForSource("agent_tool", result.agentRunId)
    ]
  };
}
