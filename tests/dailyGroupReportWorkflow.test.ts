import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { agentRuns } from "../src/db/schema";
import { runDailyGroupReportWorkflow } from "../src/workflows/dailyGroupReport";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("daily group report workflow", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("daily-group-report-workflow");
    process.env.IQ_DATA_PROFILE = "critical";
    process.env.IQ_AGENT_MODE = "fake";
    migrateTestDb();
  });

  afterEach(() => {
    delete process.env.IQ_DATA_PROFILE;
    delete process.env.IQ_AGENT_MODE;
    removeTestDb(databasePath);
  });

  it("generates a deterministic Slack-ready company report", async () => {
    const result = await runDailyGroupReportWorkflow({
      source: "test",
      payload: { useAgent: false }
    });

    expect(result.summary).toContain("*LifeShack Daily Report");
    expect(result.summary).toContain("*Revenue And Subscriptions*");
    expect(result.summary).toContain("*ATS Health*");
    expect(result.summary).toContain("*Recommended Actions*");
  });

  it("passes the deterministic report into the fake agent when requested", async () => {
    const result = await runDailyGroupReportWorkflow({
      source: "test",
      payload: { useAgent: true }
    });
    const runRows = getDb().select().from(agentRuns).all();

    expect(result.agentRunId).toBeTruthy();
    expect(result.summary).toContain("fake agent mode");
    expect(runRows).toHaveLength(1);
    expect(runRows[0]?.inputJson).toContain("deterministicReport");
  });
});
