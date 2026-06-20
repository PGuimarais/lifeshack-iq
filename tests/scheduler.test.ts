import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { completeJob } from "../src/db/queue";
import { listJobs, type WorkflowJobType } from "../src/db/queue";
import {
  scheduleDefaultJobs,
  scheduleDefinitions,
  scheduleNextWorkflowRun
} from "../src/services/scheduler";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("scheduler", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("scheduler");
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("creates one pending job for each scheduled workflow and stays idempotent", () => {
    const created = scheduleDefaultJobs(new Date("2026-01-01T00:00:00.000Z"));
    const secondPass = scheduleDefaultJobs(new Date("2026-01-01T00:01:00.000Z"));

    expect(created).toHaveLength(scheduleDefinitions.length);
    expect(secondPass).toHaveLength(0);
    expect(listJobs({ status: "queued" })).toHaveLength(scheduleDefinitions.length);
  });

  it("can skip readiness-gated production workflows", () => {
    const created = scheduleDefaultJobs(new Date("2026-01-01T00:00:00.000Z"), {
      includeProductionWorkflows: false
    });
    const productionTypes = scheduleDefinitions
      .filter((definition) => definition.productionWorkflow)
      .map((definition) => definition.type);

    expect(created).toHaveLength(
      scheduleDefinitions.filter((definition) => !definition.productionWorkflow).length
    );
    expect(created.some((job) => productionTypes.includes(job.type as WorkflowJobType)))
      .toBe(false);
  });

  it("schedules the next recurring run after a job completes", () => {
    const [job] = scheduleDefaultJobs(new Date("2026-01-01T00:00:00.000Z"));

    completeJob(job.id);
    const next = scheduleNextWorkflowRun(
      job.type as WorkflowJobType,
      new Date("2026-01-01T00:00:00.000Z")
    );

    expect(next?.type).toBe(job.type);
    expect(next?.runAt).not.toBe(job.runAt);
  });

  it("does not schedule the next recurring production run when readiness is blocked", () => {
    const [job] = scheduleDefaultJobs(new Date("2026-01-01T00:00:00.000Z"));

    completeJob(job.id);
    const next = scheduleNextWorkflowRun(
      job.type as WorkflowJobType,
      new Date("2026-01-01T00:00:00.000Z"),
      { includeProductionWorkflows: false }
    );

    expect(next).toBeNull();
  });
});
