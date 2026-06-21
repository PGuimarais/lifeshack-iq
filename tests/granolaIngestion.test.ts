import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ModelClient,
  StructuredGenerationInput,
  StructuredGenerationResult
} from "../src/agents/modelClient";
import { executeInternalTool } from "../src/agents/internalTools";
import { processGranolaTranscript } from "../src/services/granolaIngestion";
import { listOpenTasks } from "../src/services/tasks";
import {
  handleAddGranolaCommand,
  parseGranolaCommandText
} from "../src/slack/granolaCommands";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

function createGranolaClient(
  generate: (input: StructuredGenerationInput) => Promise<StructuredGenerationResult>
): ModelClient {
  return {
    name: "granola_test_client",
    model: "test-granola-model",
    generateStructured: (input) => generate(input)
  };
}

function staticGranolaClient(summary = "Jessica and Manik agreed on application volume follow-up.") {
  return createGranolaClient(async (input) => {
    const output = {
      status: "processed",
      summary,
      decisions: ["Track the application volume dip in the daily report."],
      actionItems: ["Jessica will verify the affected job board."],
      risks: [],
      contextNotes: ["Application volume was lower than expected in the meeting."],
      updatesMade: [],
      followUps: ["Review the next daily report for recovery."],
      confidence: 0.77
    };

    return {
      output: input.outputSchema.parse(output),
      rawText: JSON.stringify(output)
    };
  });
}

describe("Granola transcript ingestion", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("granola-ingestion");
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("parses optional title syntax from the slash command text", () => {
    expect(
      parseGranolaCommandText("title: Weekly Ops Review\nManik: We need to fix onboarding.")
    ).toEqual({
      title: "Weekly Ops Review",
      transcriptText: "Manik: We need to fix onboarding."
    });
    expect(parseGranolaCommandText("   ")).toBeNull();
  });

  it("persists a transcript and fallback context when no tools are called", async () => {
    const result = await processGranolaTranscript({
      title: "Application volume sync",
      transcriptText: "Jessica: App volume dipped on a key board. Manik: Let's track it.",
      capturedBySlackUserId: "U123",
      sourceChannelId: "C123",
      client: staticGranolaClient()
    });

    expect(result.transcript.title).toBe("Application volume sync");
    expect(result.transcript.processingStatus).toBe("processed");
    expect(result.output.actionItems).toContain("Jessica will verify the affected job board.");
    expect(result.contextEntries).toHaveLength(1);
    expect(result.contextEntries[0]?.sourceType).toBe("granola_transcript");
  });

  it("lets model tool calls update tasks and durable context", async () => {
    const taskArgs = {
      name: "Verify Greenhouse application volume",
      description: "Confirm whether the board is still producing applications.",
      issueId: null,
      initiativeId: null,
      ownerSlackUserId: "UOPS",
      priority: "high",
      dueDate: null
    };
    const contextArgs = {
      title: "Application volume concern",
      body: "The team flagged a suspected application volume dip during the meeting.",
      tags: ["granola", "applications"],
      importance: "high",
      relatedGoalId: null,
      relatedInitiativeId: null,
      relatedTaskId: null
    };
    const client = createGranolaClient(async (input) => {
      const taskOutput = await executeInternalTool("create_task", taskArgs, {
        proposedByRunId: input.agentRunId
      });
      const contextOutput = await executeInternalTool("record_context_note", contextArgs, {
        proposedByRunId: input.agentRunId
      });
      const output = {
        status: "processed",
        summary: "Created a follow-up task and recorded application volume context.",
        decisions: [],
        actionItems: ["Verify Greenhouse application volume."],
        risks: ["Application volume may be degraded."],
        contextNotes: ["Application volume concern recorded."],
        updatesMade: ["create_task", "record_context_note"],
        followUps: [],
        confidence: 0.82
      };

      return {
        output: input.outputSchema.parse(output),
        rawText: JSON.stringify(output),
        toolCalls: [
          {
            name: "create_task",
            arguments: taskArgs,
            output: taskOutput
          },
          {
            name: "record_context_note",
            arguments: contextArgs,
            output: contextOutput
          }
        ]
      };
    });

    const result = await processGranolaTranscript({
      transcriptText: "Manik: Greenhouse may be down. Jessica: I will verify it.",
      client
    });

    expect(result.toolCalls.map((call) => call.name)).toEqual([
      "create_task",
      "record_context_note"
    ]);
    expect(listOpenTasks()[0]?.name).toBe("Verify Greenhouse application volume");
    expect(result.contextEntries.some((entry) => entry.sourceType === "agent_tool")).toBe(true);
  });

  it("formats the /add-granola response for Slack", async () => {
    const response = await handleAddGranolaCommand({
      text: "title: Strategy Sync\nPatrick: Let's keep the activation goal active.",
      slackUserId: "U123",
      channelId: "C123",
      client: staticGranolaClient("Activation strategy context was captured.")
    });

    expect(response).toContain("*Granola transcript processed.*");
    expect(response).toContain("Activation strategy context was captured.");
    expect(response).toContain("Context notes recorded: 1");
  });
});
