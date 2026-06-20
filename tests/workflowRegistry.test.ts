import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listWorkflows,
  resolveWorkflowType,
  runWorkflow
} from "../src/services/workflowRegistry";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("workflow registry", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("workflow-registry");
    process.env.IQ_AGENT_MODE = "fake";
    migrateTestDb();
  });

  afterEach(() => {
    delete process.env.IQ_AGENT_MODE;
    removeTestDb(databasePath);
  });

  it("resolves Slack-friendly aliases", () => {
    expect(resolveWorkflowType("critical-scan")).toBe("daily_critical_scan");
    expect(resolveWorkflowType("daily-report")).toBe("daily_group_report");
    expect(resolveWorkflowType("backup")).toBe("sqlite_backup_to_s3");
    expect(listWorkflows()).toHaveLength(7);
  });

  it("runs a placeholder workflow through the registry", async () => {
    const result = await runWorkflow("critical-scan", {
      payload: { source: "test", useAgent: true },
      source: "test"
    });

    expect(result.workflowType).toBe("daily_critical_scan");
    expect(result.status).toBe("succeeded");
    expect(result.agentRunId).toBeTruthy();
  });
});
