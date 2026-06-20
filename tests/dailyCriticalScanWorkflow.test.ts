import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { agentRuns, issues } from "../src/db/schema";
import { runDailyCriticalScanWorkflow } from "../src/workflows/dailyCriticalScan";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("daily critical scan workflow", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("daily-critical-scan-workflow");
    process.env.IQ_DATA_PROFILE = "critical";
    process.env.IQ_AGENT_MODE = "fake";
    migrateTestDb();
  });

  afterEach(() => {
    delete process.env.IQ_DATA_PROFILE;
    delete process.env.IQ_AGENT_MODE;
    removeTestDb(databasePath);
  });

  it("runs deterministic scan and creates issue records", async () => {
    const result = await runDailyCriticalScanWorkflow({
      source: "test",
      payload: { useAgent: false }
    });
    const issueRows = getDb().select().from(issues).all();
    const runRows = getDb().select().from(agentRuns).all();

    expect(result.status).toBe("succeeded");
    expect(result.summary).toContain("Found");
    expect(issueRows.length).toBeGreaterThan(0);
    expect(runRows).toHaveLength(0);
  });

  it("passes rule findings into the fake agent when requested", async () => {
    const result = await runDailyCriticalScanWorkflow({
      source: "test",
      payload: { useAgent: true }
    });
    const runRows = getDb().select().from(agentRuns).all();

    expect(result.agentRunId).toBeTruthy();
    expect(result.summary).toContain("fake agent mode");
    expect(runRows).toHaveLength(1);
    expect(runRows[0]?.inputJson).toContain("findings");
  });
});
