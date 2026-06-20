import type { z } from "zod";
import { createFakeAgentClient } from "./fakeAgent";
import { createOpenAiResponsesClient } from "./openaiResponsesClient";

export type StructuredGenerationInput = {
  agentRunId?: string;
  workflowType: string;
  promptModuleName: string;
  basePromptText?: string;
  promptText: string;
  input: unknown;
  metaConfigs?: unknown;
  outputSchema: z.ZodTypeAny;
};

export type StructuredGenerationResult = {
  output: unknown;
  rawText?: string;
  toolCalls?: Array<{
    name: string;
    arguments: unknown;
    output: unknown;
  }>;
};

export type ModelClient = {
  name: string;
  model: string;
  generateStructured: (
    input: StructuredGenerationInput
  ) => Promise<StructuredGenerationResult>;
};

export function getModelClient(): ModelClient {
  const mode = process.env.IQ_AGENT_MODE ?? "fake";

  if (mode === "fake") {
    return createFakeAgentClient();
  }

  if (mode === "openai" || mode === "real") {
    return createOpenAiResponsesClient();
  }

  throw new Error(`Unknown IQ_AGENT_MODE: ${mode}. Use "fake" or "openai".`);
}
