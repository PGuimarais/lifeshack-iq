import type { ModelClient } from "../agents/modelClient";
import {
  processGranolaTranscript,
  type GranolaTranscriptProcessingResult
} from "../services/granolaIngestion";

export type ParsedGranolaCommand = {
  title?: string;
  transcriptText: string;
};

export type HandleAddGranolaCommandInput = {
  text?: string;
  slackUserId?: string;
  channelId?: string;
  client?: ModelClient;
};

export function parseGranolaCommandText(text: string | undefined): ParsedGranolaCommand | null {
  const normalized = (text ?? "").trim();

  if (!normalized) {
    return null;
  }

  const lines = normalized.split(/\r?\n/);
  const firstLine = lines[0]?.trim() ?? "";
  const titleMatch = firstLine.match(/^(?:title|meeting):\s*(.+)$/i);

  if (titleMatch && lines.length > 1) {
    const transcriptText = lines.slice(1).join("\n").trim();

    if (!transcriptText) {
      return null;
    }

    return {
      title: titleMatch[1]?.trim(),
      transcriptText
    };
  }

  return {
    transcriptText: normalized
  };
}

export function formatAddGranolaUsage(): string {
  return [
    "*Add a Granola transcript*",
    "",
    "Paste the transcript after the command. Optional first line:",
    "`title: Weekly Ops Review`",
    "",
    "Example:",
    "/add-granola title: Weekly Ops Review",
    "Manik: We need to follow up on..."
  ].join("\n");
}

function formatToolCallCounts(toolCalls: GranolaTranscriptProcessingResult["toolCalls"]): string[] {
  if (toolCalls.length === 0) {
    return ["- No agent tool updates were needed."];
  }

  const counts = new Map<string, number>();

  for (const call of toolCalls) {
    counts.set(call.name, (counts.get(call.name) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([name, count]) => `- ${name}: ${count}`);
}

export function formatGranolaProcessingResult(
  result: GranolaTranscriptProcessingResult
): string {
  const lines = [
    "*Granola transcript processed.*",
    "",
    `Transcript: ${result.transcript.id}`,
    `Status: ${result.transcript.processingStatus}`,
    "",
    "*Summary*",
    result.output.summary,
    "",
    "*Updates*",
    ...formatToolCallCounts(result.toolCalls),
    `- Context notes recorded: ${result.contextEntries.length}`
  ];

  if (result.output.actionItems.length > 0) {
    lines.push("", "*Action items*", ...result.output.actionItems.map((item) => `- ${item}`));
  }

  if (result.output.risks.length > 0) {
    lines.push("", "*Risks*", ...result.output.risks.map((risk) => `- ${risk}`));
  }

  if (result.output.followUps.length > 0) {
    lines.push("", "*Follow-ups*", ...result.output.followUps.map((followUp) => `- ${followUp}`));
  }

  return lines.join("\n");
}

export async function handleAddGranolaCommand(
  input: HandleAddGranolaCommandInput
): Promise<string> {
  const parsed = parseGranolaCommandText(input.text);

  if (!parsed) {
    return formatAddGranolaUsage();
  }

  const result = await processGranolaTranscript({
    title: parsed.title,
    transcriptText: parsed.transcriptText,
    capturedBySlackUserId: input.slackUserId,
    sourceChannelId: input.channelId,
    client: input.client
  });

  return formatGranolaProcessingResult(result);
}
