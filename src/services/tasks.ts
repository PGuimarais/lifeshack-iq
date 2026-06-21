import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  createConfigEvent,
  createId,
  jsonParseSafe,
  jsonStringifySafe,
  nowIso
} from "../db/repositories";
import { tasks } from "../db/schema";
import { getOrCreatePersonForSlackUser } from "./slackLinks";

export type TaskStatus = "open" | "in_progress" | "blocked" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export type CreateTaskInput = {
  name: string;
  description?: string;
  initiativeId?: string;
  issueId?: string;
  ownerSlackUserId?: string;
  ownerPersonId?: string;
  priority?: TaskPriority;
  dueDate?: string;
  notes?: string;
  links?: unknown;
};

export function listTasks(input: { statuses?: TaskStatus[]; limit?: number } = {}) {
  return getDb()
    .select()
    .from(tasks)
    .where(input.statuses ? inArray(tasks.status, input.statuses) : undefined)
    .orderBy(asc(tasks.createdAt))
    .limit(input.limit ?? 50)
    .all();
}

export function listOpenTasks(limit = 20) {
  return listTasks({ statuses: ["open", "in_progress", "blocked"], limit });
}

export function getTask(taskId: string) {
  const task = getDb()
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1)
    .get();

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  return task;
}

export function createTask(input: CreateTaskInput) {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Task name is required.");
  }

  const owner = input.ownerSlackUserId
    ? getOrCreatePersonForSlackUser(input.ownerSlackUserId)
    : null;
  const timestamp = nowIso();
  const row = {
    id: createId("task"),
    initiativeId: input.initiativeId,
    issueId: input.issueId,
    ownerPersonId: input.ownerPersonId ?? owner?.id,
    name,
    description: input.description,
    status: "open",
    priority: input.priority ?? "medium",
    dueDate: input.dueDate,
    notes: input.notes,
    linksJson: input.links === undefined ? null : jsonStringifySafe(input.links),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  getDb().insert(tasks).values(row).run();
  createConfigEvent({
    eventType: "task_created",
    actorSlackUserId: input.ownerSlackUserId,
    targetType: "task",
    targetId: row.id,
    after: {
      name,
      issueId: input.issueId
    }
  });
  return row;
}

export function assignTask(taskId: string, slackUserId: string) {
  const person = getOrCreatePersonForSlackUser(slackUserId);
  const timestamp = nowIso();
  getDb()
    .update(tasks)
    .set({
      ownerPersonId: person.id,
      status: "in_progress",
      updatedAt: timestamp
    })
    .where(eq(tasks.id, taskId))
    .run();
  createConfigEvent({
    eventType: "task_assigned",
    actorSlackUserId: slackUserId,
    targetType: "task",
    targetId: taskId,
    after: {
      ownerPersonId: person.id
    }
  });
  return getTask(taskId);
}

export function markTaskDone(taskId: string, actorSlackUserId?: string) {
  const timestamp = nowIso();
  getDb()
    .update(tasks)
    .set({
      status: "done",
      updatedAt: timestamp
    })
    .where(eq(tasks.id, taskId))
    .run();
  createConfigEvent({
    eventType: "task_done",
    actorSlackUserId,
    targetType: "task",
    targetId: taskId,
    after: {
      status: "done"
    }
  });
  return getTask(taskId);
}

export function cancelTask(taskId: string, actorSlackUserId?: string) {
  const timestamp = nowIso();
  getDb()
    .update(tasks)
    .set({
      status: "cancelled",
      updatedAt: timestamp
    })
    .where(eq(tasks.id, taskId))
    .run();
  createConfigEvent({
    eventType: "task_cancelled",
    actorSlackUserId,
    targetType: "task",
    targetId: taskId
  });
  return getTask(taskId);
}

export function getTaskLinks(taskId: string): unknown {
  return jsonParseSafe(getTask(taskId).linksJson, []);
}

export function taskHasIssue(taskId: string, issueId: string): boolean {
  const row = getDb()
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.issueId, issueId)))
    .limit(1)
    .get();

  return Boolean(row);
}
