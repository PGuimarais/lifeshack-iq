import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
  getQueueStats,
  listJobs
} from "../src/db/queue";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("durable queue", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("queue");
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("enqueues, claims, and completes due jobs", () => {
    const job = enqueueJob({
      type: "daily_critical_scan",
      payload: { source: "test" },
      runAt: new Date("2026-01-01T00:00:00.000Z")
    });

    const claimed = claimNextJob("2026-01-01T00:00:01.000Z");
    const completed = completeJob(job.id);
    const stats = getQueueStats();

    expect(claimed?.id).toBe(job.id);
    expect(claimed?.attempts).toBe(1);
    expect(completed.status).toBe("succeeded");
    expect(stats.succeeded).toBe(1);
  });

  it("does not claim future jobs and retries failed jobs", () => {
    const job = enqueueJob({
      type: "daily_group_report",
      runAt: new Date("2026-01-02T00:00:00.000Z")
    });

    expect(claimNextJob("2026-01-01T00:00:00.000Z")).toBeNull();

    const claimed = claimNextJob("2026-01-02T00:00:00.000Z");
    expect(claimed?.id).toBe(job.id);

    const failed = failJob(job.id, "temporary issue", { retryDelayMs: 1 });
    expect(failed.status).toBe("queued");
    expect(failed.lastError).toBe("temporary issue");
    expect(listJobs({ status: "queued" })).toHaveLength(1);
  });
});
