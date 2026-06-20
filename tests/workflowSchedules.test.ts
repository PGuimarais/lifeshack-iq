import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listJobs } from "../src/db/queue";
import {
  computeNextRunAt,
  ensureDefaultWorkflowSchedules,
  listWorkflowSchedules,
  scheduleDueWorkflowJobs,
  upsertWorkflowSchedule
} from "../src/services/workflowSchedules";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("workflow schedules", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("workflow-schedules");
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("seeds default workflow schedules", () => {
    ensureDefaultWorkflowSchedules(new Date("2026-01-01T00:00:00.000Z"));

    expect(listWorkflowSchedules().map((schedule) => schedule.workflowType))
      .toContain("daily_critical_scan");
    expect(listWorkflowSchedules().map((schedule) => schedule.workflowType))
      .toContain("teammate_checkin");
  });

  it("computes next daily, weekly, and interval runs", () => {
    expect(
      computeNextRunAt(
        {
          workflowType: "daily_group_report",
          cadence: "daily",
          timeOfDay: "08:00",
          timezone: "UTC"
        },
        new Date("2026-01-01T07:00:00.000Z")
      )
    ).toBe("2026-01-01T08:00:00.000Z");
    expect(
      computeNextRunAt(
        {
          workflowType: "weekly_reflection",
          cadence: "weekly",
          dayOfWeek: 1,
          timeOfDay: "09:00",
          timezone: "UTC"
        },
        new Date("2026-01-01T00:00:00.000Z")
      )
    ).toBe("2026-01-05T09:00:00.000Z");
    expect(
      computeNextRunAt(
        {
          workflowType: "meta_change_request",
          cadence: "interval",
          intervalMs: 1000
        },
        new Date("2026-01-01T00:00:00.000Z")
      )
    ).toBe("2026-01-01T00:00:01.000Z");
  });

  it("enqueues due enabled schedules and advances next run", () => {
    upsertWorkflowSchedule(
      {
        workflowType: "meta_change_request",
        label: "fast-meta",
        cadence: "interval",
        intervalMs: 1000,
        payload: { scheduled: true, source: "test" }
      },
      undefined,
      new Date("2026-01-01T00:00:00.000Z")
    );

    const created = scheduleDueWorkflowJobs(new Date("2026-01-01T00:00:01.001Z"));

    expect(created).toHaveLength(1);
    expect(listJobs({ status: "queued", type: "meta_change_request" })).toHaveLength(1);
  });
});
