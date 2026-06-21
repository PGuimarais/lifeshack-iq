import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { agentRuns } from "../src/db/schema";
import { createContextEntry } from "../src/services/contextEntries";
import {
  createGoal,
  createInitiative,
  createOrUpdateTeammate
} from "../src/services/operatingModel";
import { createTask } from "../src/services/tasks";
import { runWeeklyReflectionWorkflow } from "../src/workflows/weeklyReflection";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("weekly reflection workflow", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("weekly-reflection-workflow");
    process.env.IQ_DATA_PROFILE = "good";
    process.env.IQ_AGENT_MODE = "fake";
    migrateTestDb();
  });

  afterEach(() => {
    delete process.env.IQ_DATA_PROFILE;
    delete process.env.IQ_AGENT_MODE;
    removeTestDb(databasePath);
  });

  it("passes a full operating context into the agent", async () => {
    const teammate = createOrUpdateTeammate({
      name: "Manik",
      slackUserId: "U123"
    });
    const goal = createGoal({
      name: "Improve activation",
      ownerSlackUserId: "U123"
    });
    const initiative = createInitiative({
      goalId: goal.id,
      name: "Tighten onboarding",
      ownerSlackUserId: "U123"
    });
    createTask({
      name: "Review activation funnel",
      initiativeId: initiative.id,
      ownerPersonId: teammate.id
    });
    createContextEntry({
      sourceType: "test",
      title: "Activation insight",
      body: "Activation improved after onboarding copy changes.",
      tags: ["activation"],
      importance: "high",
      relatedGoalId: goal.id
    });

    const result = await runWeeklyReflectionWorkflow({
      source: "test",
      payload: { requestedBy: "vitest" }
    });
    const run = getDb().select().from(agentRuns).limit(1).get();

    expect(result.status).toBe("succeeded");
    expect(result.agentRunId).toBeTruthy();
    expect(result.summary).toContain("fake agent mode");
    expect(run?.inputJson).toContain("operatingContext");
    expect(run?.inputJson).toContain("Activation insight");
    expect(run?.inputJson).not.toContain("Placeholder workflow");
    expect(JSON.stringify(result.details)).toContain("inputCounts");
  });
});
