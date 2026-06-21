import { eq } from "drizzle-orm";
import type { ModelClient } from "../agents/modelClient";
import { runAgent } from "../agents/runAgent";
import {
  granolaTranscriptOutputSchema,
  type GranolaTranscriptOutput
} from "../agents/schemas";
import { getDb } from "../db/client";
import {
  createConfigEvent,
  createId,
  nowIso
} from "../db/repositories";
import { granolaTranscripts } from "../db/schema";
import {
  createContextEntry,
  listContextEntriesForSource
} from "./contextEntries";
import { listOpenIssues } from "./issues";
import { listGoals, listInitiatives, listTeammates } from "./operatingModel";
import { listOpenTasks } from "./tasks";

export type GranolaTranscriptProcessingInput = {
  transcriptText: string;
  title?: string;
  capturedBySlackUserId?: string;
  sourceChannelId?: string;
  client?: ModelClient;
};

export type GranolaToolCallSummary = {
  name: string;
  arguments: unknown;
  output: unknown;
};

export type GranolaTranscriptProcessingResult = {
  transcript: typeof granolaTranscripts.$inferSelect;
  output: GranolaTranscriptOutput;
  toolCalls: GranolaToolCallSummary[];
  contextEntries: Array<ReturnType<typeof listContextEntriesForSource>[number]>;
};

function defaultTitle(): string {
  return `Granola transcript ${new Date().toISOString().slice(0, 10)}`;
}

function formatFallbackContextBody(output: GranolaTranscriptOutput): string {
  const sections: Array<{ label: string; values: string[] }> = [
    { label: "Summary", values: [output.summary] },
    { label: "Decisions", values: output.decisions },
    { label: "Action items", values: output.actionItems },
    { label: "Risks", values: output.risks },
    { label: "Context notes", values: output.contextNotes },
    { label: "Follow-ups", values: output.followUps }
  ];

  return sections
    .filter(({ values }) => values.length > 0)
    .map(({ label, values }) => `${label}:\n${values.map((value) => `- ${value}`).join("\n")}`)
    .join("\n\n");
}

function buildOperatingState() {
  return {
    teammates: listTeammates({ activeOnly: true, limit: 50 }).map((person) => ({
      id: person.id,
      name: person.name,
      slackUserId: person.slackUserId,
      role: person.role,
      strengths: person.strengths,
      weaknesses: person.weaknesses,
      checkinSchedule: person.checkinSchedule
    })),
    goals: listGoals({ statuses: ["proposed", "active", "paused"], limit: 50 }),
    initiatives: listInitiatives({ statuses: ["proposed", "active", "paused"], limit: 50 }),
    openTasks: listOpenTasks(50),
    openIssues: listOpenIssues({ includeSnoozed: true, limit: 50 })
  };
}

function fetchTranscript(id: string) {
  const transcript = getDb()
    .select()
    .from(granolaTranscripts)
    .where(eq(granolaTranscripts.id, id))
    .limit(1)
    .get();

  if (!transcript) {
    throw new Error(`Granola transcript not found: ${id}`);
  }

  return transcript;
}

export async function processGranolaTranscript(
  input: GranolaTranscriptProcessingInput
): Promise<GranolaTranscriptProcessingResult> {
  const transcriptText = input.transcriptText.trim();

  if (!transcriptText) {
    throw new Error("Granola transcript text is required.");
  }

  const timestamp = nowIso();
  const row = {
    id: createId("granola"),
    title: input.title?.trim() || defaultTitle(),
    transcriptText,
    capturedBySlackUserId: input.capturedBySlackUserId,
    sourceChannelId: input.sourceChannelId,
    processingStatus: "processing",
    summary: null,
    agentRunId: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  getDb().insert(granolaTranscripts).values(row).run();
  createConfigEvent({
    eventType: "granola_transcript_received",
    actorSlackUserId: input.capturedBySlackUserId,
    targetType: "granola_transcript",
    targetId: row.id,
    after: {
      title: row.title,
      sourceChannelId: row.sourceChannelId
    }
  });

  try {
    const result = await runAgent({
      workflowType: "granola_transcript_ingest",
      promptModuleName: "granola_transcript_prompt",
      input: {
        transcript: {
          id: row.id,
          title: row.title,
          text: transcriptText,
          capturedBySlackUserId: input.capturedBySlackUserId,
          sourceChannelId: input.sourceChannelId
        },
        operatingState: buildOperatingState(),
        guidance: [
          "Extract durable decisions, commitments, risks, and useful business context.",
          "Create or update operating state only when the transcript clearly supports it.",
          "Use create_task for concrete follow-ups, create_initiative for new workstreams, propose_goal for new goals, update_goal for explicit goal changes, record_context_note for durable context, and request_approval for sensitive external actions."
        ]
      },
      outputSchema: granolaTranscriptOutputSchema,
      client: input.client
    });
    const finishedAt = nowIso();
    const recordedContext = result.toolCalls.some((call) => call.name === "record_context_note");

    if (!recordedContext) {
      createContextEntry({
        sourceType: "granola_transcript",
        sourceId: row.id,
        title: `Meeting summary: ${row.title}`,
        body: formatFallbackContextBody(result.output),
        tags: ["granola", "meeting"],
        importance: result.output.status === "needs_review" || result.output.risks.length > 0
          ? "high"
          : "medium"
      }, input.capturedBySlackUserId);
    }

    getDb()
      .update(granolaTranscripts)
      .set({
        processingStatus: result.output.status,
        summary: result.output.summary,
        agentRunId: result.agentRunId,
        updatedAt: finishedAt
      })
      .where(eq(granolaTranscripts.id, row.id))
      .run();
    createConfigEvent({
      eventType: "granola_transcript_processed",
      actorSlackUserId: input.capturedBySlackUserId,
      targetType: "granola_transcript",
      targetId: row.id,
      after: {
        status: result.output.status,
        agentRunId: result.agentRunId,
        toolCalls: result.toolCalls.map((call) => call.name)
      }
    });

    return {
      transcript: fetchTranscript(row.id),
      output: result.output,
      toolCalls: result.toolCalls,
      contextEntries: [
        ...listContextEntriesForSource("granola_transcript", row.id),
        ...listContextEntriesForSource("agent_tool", result.agentRunId)
      ]
    };
  } catch (error) {
    const failedAt = nowIso();
    const message = error instanceof Error ? error.message : String(error);

    getDb()
      .update(granolaTranscripts)
      .set({
        processingStatus: "failed",
        summary: message,
        updatedAt: failedAt
      })
      .where(eq(granolaTranscripts.id, row.id))
      .run();
    createConfigEvent({
      eventType: "granola_transcript_failed",
      actorSlackUserId: input.capturedBySlackUserId,
      targetType: "granola_transcript",
      targetId: row.id,
      after: {
        error: message
      }
    });

    throw error;
  }
}
