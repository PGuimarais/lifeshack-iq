import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  createConfigEvent,
  createId,
  jsonParseSafe,
  jsonStringifySafe,
  nowIso
} from "../db/repositories";
import { contextEntries } from "../db/schema";

export type ContextImportance = "low" | "medium" | "high";

export type CreateContextEntryInput = {
  sourceType: string;
  sourceId?: string;
  title: string;
  body: string;
  tags?: string[];
  importance?: ContextImportance;
  relatedGoalId?: string;
  relatedInitiativeId?: string;
  relatedTaskId?: string;
};

export function createContextEntry(
  input: CreateContextEntryInput,
  actorSlackUserId?: string
) {
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title) {
    throw new Error("Context title is required.");
  }

  if (!body) {
    throw new Error("Context body is required.");
  }

  const timestamp = nowIso();
  const row = {
    id: createId("ctx"),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    title,
    body,
    tagsJson: input.tags === undefined ? null : jsonStringifySafe(input.tags),
    importance: input.importance ?? "medium",
    relatedGoalId: input.relatedGoalId,
    relatedInitiativeId: input.relatedInitiativeId,
    relatedTaskId: input.relatedTaskId,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  getDb().insert(contextEntries).values(row).run();
  createConfigEvent({
    eventType: "context_entry_created",
    actorSlackUserId,
    targetType: "context_entry",
    targetId: row.id,
    after: row
  });
  return row;
}

export function listRecentContextEntries(limit = 20) {
  return getDb()
    .select()
    .from(contextEntries)
    .orderBy(desc(contextEntries.createdAt))
    .limit(limit)
    .all()
    .map((entry) => ({
      ...entry,
      tags: jsonParseSafe<string[]>(entry.tagsJson, [])
    }));
}

export function listContextEntriesForSource(sourceType: string, sourceId: string) {
  return getDb()
    .select()
    .from(contextEntries)
    .where(eq(contextEntries.sourceType, sourceType))
    .all()
    .filter((entry) => entry.sourceId === sourceId)
    .map((entry) => ({
      ...entry,
      tags: jsonParseSafe<string[]>(entry.tagsJson, [])
    }));
}
