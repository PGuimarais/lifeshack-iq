import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workflowAgentOutputSchema } from "../src/agents/schemas";
import { runAgent } from "../src/agents/runAgent";
import { getDb } from "../src/db/client";
import { agentRuns, toolCalls } from "../src/db/schema";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("runAgent", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("run-agent");
    process.env.IQ_AGENT_MODE = "fake";
    migrateTestDb();
  });

  afterEach(() => {
    delete process.env.IQ_AGENT_MODE;
    removeTestDb(databasePath);
  });

  it("runs fake structured output and persists agent and tool rows", async () => {
    const result = await runAgent({
      workflowType: "daily_critical_scan",
      promptModuleName: "daily_critical_scan_prompt",
      input: { sample: true },
      outputSchema: workflowAgentOutputSchema
    });
    const run = getDb()
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, result.agentRunId))
      .limit(1)
      .get();
    const toolCall = getDb()
      .select()
      .from(toolCalls)
      .where(eq(toolCalls.agentRunId, result.agentRunId))
      .limit(1)
      .get();

    expect(result.output.summary).toContain("fake agent mode");
    expect(run?.status).toBe("succeeded");
    expect(run?.promptVersionsJson).toContain("daily_critical_scan_prompt");
    expect(toolCall?.status).toBe("succeeded");
    expect(toolCall?.toolName).toBe("fake_agent.generate_structured");
  });
});
