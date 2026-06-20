import { and, asc, eq, lte } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  createConfigEvent,
  createId,
  jsonParseSafe,
  jsonStringifySafe,
  nowIso
} from "../db/repositories";
import {
  enqueueJob,
  hasPendingJobOfType,
  type QueueJob,
  type WorkflowJobType
} from "../db/queue";
import { workflowSchedules } from "../db/schema";

export type ScheduleCadence = "daily" | "weekly" | "interval";

export type WorkflowScheduleInput = {
  workflowType: WorkflowJobType;
  label?: string;
  enabled?: boolean;
  cadence: ScheduleCadence;
  timeOfDay?: string;
  timezone?: string;
  dayOfWeek?: number;
  intervalMs?: number;
  productionWorkflow?: boolean;
  payload?: unknown;
};

type LocalParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
};

const weekdayByName = new Map([
  ["sunday", 0],
  ["sun", 0],
  ["monday", 1],
  ["mon", 1],
  ["tuesday", 2],
  ["tue", 2],
  ["wednesday", 3],
  ["wed", 3],
  ["thursday", 4],
  ["thu", 4],
  ["friday", 5],
  ["fri", 5],
  ["saturday", 6],
  ["sat", 6]
]);

export const defaultWorkflowScheduleInputs: WorkflowScheduleInput[] = [
  {
    workflowType: "daily_critical_scan",
    label: "daily-critical-scan",
    cadence: "daily",
    timeOfDay: "08:00",
    timezone: "America/New_York",
    productionWorkflow: true,
    payload: { scheduled: true, source: "scheduler", useAgent: true }
  },
  {
    workflowType: "daily_group_report",
    label: "daily-group-report",
    cadence: "daily",
    timeOfDay: "17:00",
    timezone: "America/New_York",
    productionWorkflow: true,
    payload: { scheduled: true, source: "scheduler", useAgent: true }
  },
  {
    workflowType: "weekly_reflection",
    label: "weekly-reflection",
    cadence: "weekly",
    dayOfWeek: 1,
    timeOfDay: "09:00",
    timezone: "America/New_York",
    productionWorkflow: true,
    payload: { scheduled: true, source: "scheduler" }
  },
  {
    workflowType: "teammate_checkin",
    label: "teammate-checkin",
    cadence: "daily",
    timeOfDay: "08:00",
    timezone: "America/New_York",
    productionWorkflow: true,
    payload: { scheduled: true, source: "scheduler" }
  },
  {
    workflowType: "sqlite_backup_to_s3",
    label: "sqlite-backup",
    cadence: "daily",
    timeOfDay: "02:00",
    timezone: "America/New_York",
    productionWorkflow: false,
    payload: { scheduled: true, source: "scheduler" }
  },
  {
    workflowType: "meta_change_request",
    label: "meta-change",
    cadence: "interval",
    intervalMs: 5 * 60 * 1000,
    productionWorkflow: false,
    payload: { scheduled: true, source: "scheduler" }
  }
];

function parseTimeOfDay(value: string | undefined): { hour: number; minute: number } {
  const match = value?.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (!match) {
    throw new Error("Schedule time must use HH:mm, for example 08:00.");
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}

export function parseDayOfWeek(value: string): number {
  const numeric = Number(value);

  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) {
    return numeric;
  }

  const named = weekdayByName.get(value.trim().toLowerCase());

  if (named === undefined) {
    throw new Error("Day of week must be 0-6 or a day name like monday.");
  }

  return named;
}

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const weekday = parseDayOfWeek(byType.get("weekday") ?? "sun");

  return {
    year: Number(byType.get("year")),
    month: Number(byType.get("month")),
    day: Number(byType.get("day")),
    weekday,
    hour: Number(byType.get("hour")) % 24,
    minute: Number(byType.get("minute"))
  };
}

function zonedTimeToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timeZone: string;
}): Date {
  let utc = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute);

  for (let i = 0; i < 2; i += 1) {
    const parts = localParts(new Date(utc), input.timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    utc -= asUtc - Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute);
  }

  return new Date(utc);
}

function addLocalDays(parts: LocalParts, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

export function computeNextRunAt(input: WorkflowScheduleInput, from = new Date()): string {
  if (input.cadence === "interval") {
    const intervalMs = input.intervalMs ?? 5 * 60 * 1000;
    return new Date(from.getTime() + intervalMs).toISOString();
  }

  const timezone = input.timezone ?? "America/New_York";
  const time = parseTimeOfDay(input.timeOfDay);
  const currentLocal = localParts(from, timezone);
  const maxDays = input.cadence === "weekly" ? 14 : 8;

  for (let offset = 0; offset < maxDays; offset += 1) {
    const localDate = addLocalDays(currentLocal, offset);
    const target = zonedTimeToUtc({
      ...localDate,
      hour: time.hour,
      minute: time.minute,
      timeZone: timezone
    });
    const targetWeekday = localParts(target, timezone).weekday;

    if (input.cadence === "weekly" && targetWeekday !== input.dayOfWeek) {
      continue;
    }

    if (target.getTime() > from.getTime()) {
      return target.toISOString();
    }
  }

  return new Date(from.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

function rowToInput(row: typeof workflowSchedules.$inferSelect): WorkflowScheduleInput {
  return {
    workflowType: row.workflowType as WorkflowJobType,
    label: row.label,
    enabled: row.enabled === 1,
    cadence: row.cadence as ScheduleCadence,
    timeOfDay: row.timeOfDay ?? undefined,
    timezone: row.timezone,
    dayOfWeek: row.dayOfWeek ?? undefined,
    intervalMs: row.intervalMs ?? undefined,
    productionWorkflow: row.productionWorkflow === 1,
    payload: jsonParseSafe(row.payloadJson, undefined)
  };
}

export function ensureDefaultWorkflowSchedules(now = new Date()): void {
  for (const schedule of defaultWorkflowScheduleInputs) {
    const label = schedule.label ?? schedule.workflowType;
    const existing = getDb()
      .select()
      .from(workflowSchedules)
      .where(eq(workflowSchedules.label, label))
      .limit(1)
      .get();

    if (existing) {
      continue;
    }

    upsertWorkflowSchedule(schedule, undefined, now);
  }
}

export function listWorkflowSchedules() {
  ensureDefaultWorkflowSchedules();

  return getDb()
    .select()
    .from(workflowSchedules)
    .orderBy(asc(workflowSchedules.workflowType), asc(workflowSchedules.label))
    .all();
}

export function upsertWorkflowSchedule(
  input: WorkflowScheduleInput,
  actorSlackUserId?: string,
  now = new Date()
) {
  const label = input.label ?? input.workflowType;
  const existing = getDb()
    .select()
    .from(workflowSchedules)
    .where(eq(workflowSchedules.label, label))
    .limit(1)
    .get();
  const timestamp = nowIso();
  const values = {
    workflowType: input.workflowType,
    label,
    enabled: input.enabled === false ? 0 : 1,
    cadence: input.cadence,
    timeOfDay: input.timeOfDay,
    timezone: input.timezone ?? "America/New_York",
    dayOfWeek: input.dayOfWeek,
    intervalMs: input.intervalMs,
    productionWorkflow: input.productionWorkflow ? 1 : 0,
    payloadJson: input.payload === undefined ? null : jsonStringifySafe(input.payload),
    nextRunAt: computeNextRunAt(input, now),
    updatedAt: timestamp
  };

  if (existing) {
    getDb()
      .update(workflowSchedules)
      .set(values)
      .where(eq(workflowSchedules.id, existing.id))
      .run();
    createConfigEvent({
      eventType: "workflow_schedule_updated",
      actorSlackUserId,
      targetType: "workflow_schedule",
      targetId: existing.id,
      after: values
    });
    return getDb().select().from(workflowSchedules).where(eq(workflowSchedules.id, existing.id)).get();
  }

  const row = {
    id: createId("sched"),
    ...values,
    createdAt: timestamp
  };
  getDb().insert(workflowSchedules).values(row).run();
  createConfigEvent({
    eventType: "workflow_schedule_created",
    actorSlackUserId,
    targetType: "workflow_schedule",
    targetId: row.id,
    after: row
  });
  return row;
}

export function setWorkflowScheduleEnabled(
  workflowType: WorkflowJobType,
  enabled: boolean,
  actorSlackUserId?: string
) {
  ensureDefaultWorkflowSchedules();
  const timestamp = nowIso();
  getDb()
    .update(workflowSchedules)
    .set({ enabled: enabled ? 1 : 0, updatedAt: timestamp })
    .where(eq(workflowSchedules.workflowType, workflowType))
    .run();
  createConfigEvent({
    eventType: enabled ? "workflow_schedule_enabled" : "workflow_schedule_disabled",
    actorSlackUserId,
    targetType: "workflow",
    targetId: workflowType
  });
}

export function scheduleDueWorkflowJobs(
  now = new Date(),
  input: { includeProductionWorkflows?: boolean } = {}
): QueueJob[] {
  ensureDefaultWorkflowSchedules(now);
  const nowString = now.toISOString();
  const dueSchedules = getDb()
    .select()
    .from(workflowSchedules)
    .where(and(eq(workflowSchedules.enabled, 1), lte(workflowSchedules.nextRunAt, nowString)))
    .orderBy(asc(workflowSchedules.nextRunAt))
    .all();
  const created: QueueJob[] = [];

  for (const schedule of dueSchedules) {
    if (schedule.productionWorkflow === 1 && input.includeProductionWorkflows === false) {
      continue;
    }

    const workflowType = schedule.workflowType as WorkflowJobType;

    if (!hasPendingJobOfType(workflowType)) {
      created.push(
        enqueueJob({
          type: workflowType,
          payload: jsonParseSafe(schedule.payloadJson, {
            scheduled: true,
            source: "scheduler",
            scheduleId: schedule.id
          })
        })
      );
    }

    const scheduleInput = rowToInput(schedule);
    const nextRunAt = computeNextRunAt(scheduleInput, now);
    getDb()
      .update(workflowSchedules)
      .set({
        lastRunAt: nowString,
        nextRunAt,
        updatedAt: nowIso()
      })
      .where(eq(workflowSchedules.id, schedule.id))
      .run();
  }

  return created;
}
