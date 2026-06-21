import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  createConfigEvent,
  createId,
  jsonParseSafe,
  jsonStringifySafe,
  nowIso
} from "../db/repositories";
import { goals, initiatives, people } from "../db/schema";

export type CheckinScheduleConfig = {
  enabled: boolean;
  cadence: "daily" | "weekly";
  timeOfDay: string;
  timezone: string;
  dayOfWeek?: number;
};

export type CreateTeammateInput = {
  name: string;
  slackUserId?: string;
  role?: string;
  strengths?: string[];
  weaknesses?: string[];
  checkinSchedule?: CheckinScheduleConfig;
};

export type CreateGoalInput = {
  name: string;
  description?: string;
  area?: string;
  ownerSlackUserId?: string;
  ownerPersonId?: string;
  targetMetric?: string;
  targetValue?: string;
  dueDate?: string;
  status?: "proposed" | "active" | "paused" | "completed" | "cancelled";
};

export type UpdateGoalInput = {
  name?: string;
  description?: string;
  area?: string;
  ownerSlackUserId?: string;
  ownerPersonId?: string;
  targetMetric?: string;
  targetValue?: string;
  dueDate?: string;
  status?: "proposed" | "active" | "paused" | "completed" | "cancelled";
};

export type CreateInitiativeInput = {
  goalId?: string;
  name: string;
  description?: string;
  ownerSlackUserId?: string;
  ownerPersonId?: string;
  status?: "proposed" | "active" | "paused" | "completed" | "cancelled";
  progress?: string;
};

function normalizeSlackUserId(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^<@([^>|]+)(?:\|[^>]+)?>$/);
  return match?.[1] ?? value.trim();
}

function asJsonArray(value: string | null): string[] {
  return jsonParseSafe<string[]>(value, []);
}

function getPersonBySlackUser(slackUserId: string | undefined) {
  const normalized = normalizeSlackUserId(slackUserId);

  if (!normalized) {
    return null;
  }

  return getDb()
    .select()
    .from(people)
    .where(eq(people.slackUserId, normalized))
    .limit(1)
    .get() ?? null;
}

export function getPerson(personId: string) {
  const person = getDb()
    .select()
    .from(people)
    .where(eq(people.id, personId))
    .limit(1)
    .get();

  if (!person) {
    throw new Error(`Teammate not found: ${personId}`);
  }

  return person;
}

export function getPersonForSlackUser(slackUserId: string) {
  return getPersonBySlackUser(slackUserId);
}

export function createOrUpdateTeammate(input: CreateTeammateInput, actorSlackUserId?: string) {
  const slackUserId = normalizeSlackUserId(input.slackUserId);
  const timestamp = nowIso();
  const existing = getPersonBySlackUser(slackUserId);
  const row = {
    name: input.name.trim(),
    slackUserId,
    role: input.role,
    strengthsJson:
      input.strengths === undefined ? existing?.strengthsJson ?? null : jsonStringifySafe(input.strengths),
    weaknessesJson:
      input.weaknesses === undefined ? existing?.weaknessesJson ?? null : jsonStringifySafe(input.weaknesses),
    checkinScheduleJson:
      input.checkinSchedule === undefined
        ? existing?.checkinScheduleJson ?? null
        : jsonStringifySafe(input.checkinSchedule),
    active: 1,
    updatedAt: timestamp
  };

  if (!row.name) {
    throw new Error("Teammate name is required.");
  }

  if (existing) {
    getDb()
      .update(people)
      .set(row)
      .where(eq(people.id, existing.id))
      .run();
    createConfigEvent({
      eventType: "teammate_updated",
      actorSlackUserId,
      targetType: "person",
      targetId: existing.id,
      after: row
    });
    return getPerson(existing.id);
  }

  const created = {
    id: createId("person"),
    ...row,
    createdAt: timestamp
  };
  getDb().insert(people).values(created).run();
  createConfigEvent({
    eventType: "teammate_created",
    actorSlackUserId,
    targetType: "person",
    targetId: created.id,
    after: created
  });
  return created;
}

export function listTeammates(input: { activeOnly?: boolean; limit?: number } = {}) {
  const rows = getDb()
    .select()
    .from(people)
    .where(input.activeOnly === false ? undefined : eq(people.active, 1))
    .orderBy(asc(people.name))
    .limit(input.limit ?? 50)
    .all();

  return rows.map((person) => ({
    ...person,
    strengths: asJsonArray(person.strengthsJson),
    weaknesses: asJsonArray(person.weaknessesJson),
    checkinSchedule: jsonParseSafe<CheckinScheduleConfig | null>(
      person.checkinScheduleJson,
      null
    )
  }));
}

function resolveOwner(input: { ownerSlackUserId?: string; ownerPersonId?: string }) {
  if (input.ownerPersonId) {
    return getPerson(input.ownerPersonId);
  }

  return input.ownerSlackUserId ? getPersonBySlackUser(input.ownerSlackUserId) : null;
}

export function createGoal(input: CreateGoalInput, actorSlackUserId?: string) {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Goal name is required.");
  }

  const owner = resolveOwner(input);
  const timestamp = nowIso();
  const row = {
    id: createId("goal"),
    name,
    description: input.description,
    area: input.area,
    ownerPersonId: owner?.id,
    targetMetric: input.targetMetric,
    targetValue: input.targetValue,
    dueDate: input.dueDate,
    status: input.status ?? "active",
    createdAt: timestamp,
    updatedAt: timestamp
  };

  getDb().insert(goals).values(row).run();
  createConfigEvent({
    eventType: "goal_created",
    actorSlackUserId,
    targetType: "goal",
    targetId: row.id,
    after: row
  });
  return row;
}

export function listGoals(input: { statuses?: string[]; limit?: number } = {}) {
  return getDb()
    .select()
    .from(goals)
    .where(input.statuses ? inArray(goals.status, input.statuses) : undefined)
    .orderBy(asc(goals.createdAt))
    .limit(input.limit ?? 25)
    .all();
}

export function getGoal(goalId: string) {
  const goal = getDb()
    .select()
    .from(goals)
    .where(eq(goals.id, goalId))
    .limit(1)
    .get();

  if (!goal) {
    throw new Error(`Goal not found: ${goalId}`);
  }

  return goal;
}

export function assignGoalOwner(goalId: string, slackUserId: string, actorSlackUserId?: string) {
  const owner = getPersonBySlackUser(slackUserId);

  if (!owner) {
    throw new Error(`No teammate found for Slack user ${slackUserId}.`);
  }

  const timestamp = nowIso();
  getDb()
    .update(goals)
    .set({ ownerPersonId: owner.id, updatedAt: timestamp })
    .where(eq(goals.id, goalId))
    .run();
  createConfigEvent({
    eventType: "goal_owner_assigned",
    actorSlackUserId,
    targetType: "goal",
    targetId: goalId,
    after: { ownerPersonId: owner.id }
  });
  return getGoal(goalId);
}

export function updateGoal(
  goalId: string,
  input: UpdateGoalInput,
  actorSlackUserId?: string
) {
  const existing = getGoal(goalId);
  const owner = resolveOwner(input);
  const timestamp = nowIso();
  const next = {
    name: input.name?.trim() || existing.name,
    description: input.description ?? existing.description,
    area: input.area ?? existing.area,
    ownerPersonId: owner?.id ?? input.ownerPersonId ?? existing.ownerPersonId,
    targetMetric: input.targetMetric ?? existing.targetMetric,
    targetValue: input.targetValue ?? existing.targetValue,
    dueDate: input.dueDate ?? existing.dueDate,
    status: input.status ?? existing.status,
    updatedAt: timestamp
  };

  getDb()
    .update(goals)
    .set(next)
    .where(eq(goals.id, goalId))
    .run();
  createConfigEvent({
    eventType: "goal_updated",
    actorSlackUserId,
    targetType: "goal",
    targetId: goalId,
    before: existing,
    after: next
  });
  return getGoal(goalId);
}

export function createInitiative(input: CreateInitiativeInput, actorSlackUserId?: string) {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Initiative name is required.");
  }

  if (input.goalId) {
    getGoal(input.goalId);
  }

  const owner = resolveOwner(input);
  const timestamp = nowIso();
  const row = {
    id: createId("init"),
    goalId: input.goalId,
    name,
    description: input.description,
    status: input.status ?? "active",
    progress: input.progress,
    ownerPersonId: owner?.id,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  getDb().insert(initiatives).values(row).run();
  createConfigEvent({
    eventType: "initiative_created",
    actorSlackUserId,
    targetType: "initiative",
    targetId: row.id,
    after: row
  });
  return row;
}

export function getInitiative(initiativeId: string) {
  const initiative = getDb()
    .select()
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .limit(1)
    .get();

  if (!initiative) {
    throw new Error(`Initiative not found: ${initiativeId}`);
  }

  return initiative;
}

export function assignInitiativeOwner(
  initiativeId: string,
  slackUserId: string,
  actorSlackUserId?: string
) {
  const owner = getPersonBySlackUser(slackUserId);

  if (!owner) {
    throw new Error(`No teammate found for Slack user ${slackUserId}.`);
  }

  const timestamp = nowIso();
  getDb()
    .update(initiatives)
    .set({ ownerPersonId: owner.id, updatedAt: timestamp })
    .where(eq(initiatives.id, initiativeId))
    .run();
  createConfigEvent({
    eventType: "initiative_owner_assigned",
    actorSlackUserId,
    targetType: "initiative",
    targetId: initiativeId,
    after: { ownerPersonId: owner.id }
  });
  return getInitiative(initiativeId);
}

export function listInitiatives(input: {
  statuses?: string[];
  goalId?: string;
  limit?: number;
} = {}) {
  let rows = getDb()
    .select()
    .from(initiatives)
    .where(input.statuses ? inArray(initiatives.status, input.statuses) : undefined)
    .orderBy(asc(initiatives.createdAt))
    .limit(input.limit ?? 25)
    .all();

  if (input.goalId) {
    rows = rows.filter((initiative) => initiative.goalId === input.goalId);
  }

  return rows;
}
