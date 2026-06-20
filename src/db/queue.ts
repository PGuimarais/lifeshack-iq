import { and, asc, count, eq, lte, or } from "drizzle-orm";
import { getDb } from "./client";
import { createId, jsonParseSafe, jsonStringifySafe, nowIso } from "./repositories";
import { jobs } from "./schema";

export const workflowJobTypes = [
  "daily_critical_scan",
  "daily_group_report",
  "weekly_reflection",
  "teammate_checkin",
  "sqlite_backup_to_s3",
  "meta_change_request",
  "approval_action"
] as const;

export type WorkflowJobType = (typeof workflowJobTypes)[number];
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type QueueJob = typeof jobs.$inferSelect & {
  payload: unknown;
  status: JobStatus;
};

export type EnqueueJobInput = {
  type: WorkflowJobType | string;
  payload?: unknown;
  runAt?: string | Date;
  maxAttempts?: number;
};

function serializeRunAt(runAt?: string | Date): string {
  if (!runAt) {
    return nowIso();
  }

  return runAt instanceof Date ? runAt.toISOString() : runAt;
}

function mapJob(row: typeof jobs.$inferSelect | undefined): QueueJob | null {
  if (!row) {
    return null;
  }

  return {
    ...row,
    payload: jsonParseSafe(row.payloadJson, null),
    status: row.status as JobStatus
  };
}

export function enqueueJob(input: EnqueueJobInput): QueueJob {
  const timestamp = nowIso();
  const row = {
    id: createId("job"),
    type: input.type,
    payloadJson: input.payload === undefined ? null : jsonStringifySafe(input.payload),
    status: "queued",
    runAt: serializeRunAt(input.runAt),
    lockedAt: null,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    lastError: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  getDb().insert(jobs).values(row).run();
  const mapped = mapJob(row);

  if (!mapped) {
    throw new Error("Failed to map enqueued job");
  }

  return mapped;
}

export function getJob(id: string): QueueJob | null {
  return mapJob(getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1).get());
}

export function listJobs(input: { status?: JobStatus; type?: string; limit?: number } = {}): QueueJob[] {
  const conditions = [
    input.status ? eq(jobs.status, input.status) : undefined,
    input.type ? eq(jobs.type, input.type) : undefined
  ].filter(Boolean);
  const whereClause = conditions.length === 0 ? undefined : and(...conditions);
  const query = getDb()
    .select()
    .from(jobs)
    .where(whereClause)
    .orderBy(asc(jobs.runAt), asc(jobs.createdAt))
    .limit(input.limit ?? 100);

  return query.all().map((row) => {
    const mapped = mapJob(row);

    if (!mapped) {
      throw new Error("Failed to map job row");
    }

    return mapped;
  });
}

export function hasPendingJobOfType(type: string): boolean {
  const row = getDb()
    .select({ value: count() })
    .from(jobs)
    .where(and(eq(jobs.type, type), or(eq(jobs.status, "queued"), eq(jobs.status, "running"))))
    .get();

  return Number(row?.value ?? 0) > 0;
}

export function claimNextJob(now = nowIso()): QueueJob | null {
  return getDb().transaction((tx) => {
    const row = tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "queued"), lte(jobs.runAt, now)))
      .orderBy(asc(jobs.runAt), asc(jobs.createdAt))
      .limit(1)
      .get();

    if (!row) {
      return null;
    }

    const timestamp = nowIso();
    tx.update(jobs)
      .set({
        status: "running",
        lockedAt: timestamp,
        attempts: row.attempts + 1,
        updatedAt: timestamp
      })
      .where(and(eq(jobs.id, row.id), eq(jobs.status, "queued")))
      .run();

    return mapJob({
      ...row,
      status: "running",
      lockedAt: timestamp,
      attempts: row.attempts + 1,
      updatedAt: timestamp
    });
  });
}

export function completeJob(id: string): QueueJob {
  const timestamp = nowIso();
  getDb()
    .update(jobs)
    .set({
      status: "succeeded",
      lockedAt: null,
      lastError: null,
      updatedAt: timestamp
    })
    .where(eq(jobs.id, id))
    .run();

  const job = getJob(id);

  if (!job) {
    throw new Error(`Job not found: ${id}`);
  }

  return job;
}

export function failJob(
  id: string,
  error: string,
  input: { retryDelayMs?: number; retry?: boolean } = {}
): QueueJob {
  const job = getJob(id);

  if (!job) {
    throw new Error(`Job not found: ${id}`);
  }

  const timestamp = nowIso();
  const retry = input.retry ?? job.attempts < job.maxAttempts;
  const runAt = new Date(Date.now() + (input.retryDelayMs ?? 60_000)).toISOString();

  getDb()
    .update(jobs)
    .set({
      status: retry ? "queued" : "failed",
      lockedAt: null,
      runAt: retry ? runAt : job.runAt,
      lastError: error,
      updatedAt: timestamp
    })
    .where(eq(jobs.id, id))
    .run();

  const updated = getJob(id);

  if (!updated) {
    throw new Error(`Job not found after failure update: ${id}`);
  }

  return updated;
}

export function cancelJob(id: string): QueueJob {
  const timestamp = nowIso();
  getDb()
    .update(jobs)
    .set({
      status: "cancelled",
      lockedAt: null,
      updatedAt: timestamp
    })
    .where(eq(jobs.id, id))
    .run();

  const job = getJob(id);

  if (!job) {
    throw new Error(`Job not found: ${id}`);
  }

  return job;
}

export function getQueueStats() {
  const rows = getDb()
    .select({
      status: jobs.status,
      value: count()
    })
    .from(jobs)
    .groupBy(jobs.status)
    .all();

  return rows.reduce<Record<JobStatus, number>>(
    (acc, row) => {
      acc[row.status as JobStatus] = Number(row.value);
      return acc;
    },
    {
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0
    }
  );
}
