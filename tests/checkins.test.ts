import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ModelClient,
  StructuredGenerationInput,
  StructuredGenerationResult
} from "../src/agents/modelClient";
import { executeInternalTool } from "../src/agents/internalTools";
import { getDb } from "../src/db/client";
import { createId, nowIso } from "../src/db/repositories";
import { agentRuns, checkins } from "../src/db/schema";
import {
  interpretCheckinReply,
  listDueCheckinTeammates,
  recordCheckinReply,
  sendTeammateCheckin
} from "../src/services/checkins";
import { listContextEntriesForSource } from "../src/services/contextEntries";
import { createOrUpdateTeammate } from "../src/services/operatingModel";
import { listOpenTasks } from "../src/services/tasks";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

function createCheckinClient(
  generate: (input: StructuredGenerationInput) => Promise<StructuredGenerationResult>
): ModelClient {
  return {
    name: "checkin_test_client",
    model: "test-checkin-model",
    generateStructured: generate
  };
}

function staticCheckinClient(summary = "Processed the check-in reply.") {
  return createCheckinClient(async (input) => {
    const output = {
      status: "processed",
      summary,
      progressUpdates: ["Dashboard shipped."],
      blockers: [],
      actionItems: ["Review Stripe data access."],
      goalOrInitiativeUpdates: [],
      approvalsNeeded: [],
      updatesMade: [],
      followUps: [],
      confidence: 0.8
    };

    return {
      output: input.outputSchema.parse(output),
      rawText: JSON.stringify(output)
    };
  });
}

describe("teammate check-ins", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("checkins");
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("records a local check-in when Slack is not configured", async () => {
    const teammate = createOrUpdateTeammate({
      name: "Jessica",
      slackUserId: "U456"
    });

    const checkin = await sendTeammateCheckin({ personId: teammate.id });

    expect(checkin.status).toBe("not_sent");
    expect(checkin.promptText).toContain("Jessica");
  });

  it("finds due teammates based on configured check-in schedules", () => {
    const teammate = createOrUpdateTeammate({
      name: "Manik",
      slackUserId: "U123",
      checkinSchedule: {
        enabled: true,
        cadence: "daily",
        timeOfDay: "08:00",
        timezone: "UTC"
      }
    });

    const due = listDueCheckinTeammates(new Date("2026-01-01T08:01:00.000Z"));

    expect(due.map((person) => person.id)).toContain(teammate.id);
  });

  it("records Slack DM replies against the latest pending check-in", () => {
    const teammate = createOrUpdateTeammate({
      name: "Manik",
      slackUserId: "U123"
    });
    const timestamp = nowIso();
    getDb()
      .insert(checkins)
      .values({
        id: createId("checkin"),
        personId: teammate.id,
        jobId: null,
        channelId: "D123",
        messageTs: "1.0",
        status: "pending",
        promptText: "Check in?",
        responseText: null,
        responseTs: null,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .run();

    const recorded = recordCheckinReply({
      slackUserId: "U123",
      channelId: "D123",
      text: "I shipped the dashboard and I am blocked on Stripe data.",
      ts: "2.0"
    });

    expect(recorded?.status).toBe("responded");
    expect(recorded?.responseText).toContain("blocked on Stripe");
  });

  it("interprets a check-in reply and records durable context", async () => {
    const teammate = createOrUpdateTeammate({
      name: "Manik",
      slackUserId: "U123"
    });
    const timestamp = nowIso();
    getDb()
      .insert(checkins)
      .values({
        id: createId("checkin"),
        personId: teammate.id,
        jobId: null,
        channelId: "D123",
        messageTs: "1.0",
        status: "pending",
        promptText: "Check in?",
        responseText: null,
        responseTs: null,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .run();
    const recorded = recordCheckinReply({
      slackUserId: "U123",
      channelId: "D123",
      text: "I shipped the dashboard and need Stripe data access next.",
      ts: "2.0"
    });

    const interpreted = await interpretCheckinReply({
      checkinId: recorded!.id,
      client: staticCheckinClient()
    });

    expect(interpreted.checkin.status).toBe("interpreted");
    expect(interpreted.output.summary).toContain("Processed");
    expect(interpreted.contextEntries[0]?.sourceType).toBe("checkin_reply");
    expect(listContextEntriesForSource("checkin_reply", recorded!.id)).toHaveLength(1);
    expect(getDb().select().from(agentRuns).all()).toHaveLength(1);
  });

  it("lets check-in reply tools create follow-up tasks", async () => {
    const teammate = createOrUpdateTeammate({
      name: "Jessica",
      slackUserId: "U456"
    });
    const timestamp = nowIso();
    getDb()
      .insert(checkins)
      .values({
        id: createId("checkin"),
        personId: teammate.id,
        jobId: null,
        channelId: "D456",
        messageTs: "1.0",
        status: "pending",
        promptText: "Check in?",
        responseText: null,
        responseTs: null,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .run();
    const recorded = recordCheckinReply({
      slackUserId: "U456",
      channelId: "D456",
      text: "Application volume dropped. I should inspect the Ashby queue today.",
      ts: "2.0"
    });
    const taskArgs = {
      name: "Inspect Ashby application queue",
      description: "Jessica flagged an application volume drop in check-in.",
      issueId: null,
      initiativeId: null,
      ownerSlackUserId: "U456",
      priority: "high",
      dueDate: null
    };
    const client = createCheckinClient(async (input) => {
      const taskOutput = await executeInternalTool("create_task", taskArgs, {
        proposedByRunId: input.agentRunId
      });
      const output = {
        status: "processed",
        summary: "Created an Ashby queue follow-up task.",
        progressUpdates: [],
        blockers: ["Application volume dropped."],
        actionItems: ["Inspect Ashby application queue."],
        goalOrInitiativeUpdates: [],
        approvalsNeeded: [],
        updatesMade: ["create_task"],
        followUps: [],
        confidence: 0.86
      };

      return {
        output: input.outputSchema.parse(output),
        rawText: JSON.stringify(output),
        toolCalls: [
          {
            name: "create_task",
            arguments: taskArgs,
            output: taskOutput
          }
        ]
      };
    });

    const interpreted = await interpretCheckinReply({
      checkinId: recorded!.id,
      client
    });

    expect(interpreted.toolCalls[0]?.name).toBe("create_task");
    expect(listOpenTasks()[0]?.name).toBe("Inspect Ashby application queue");
    expect(interpreted.contextEntries[0]?.sourceType).toBe("checkin_reply");
  });
});
