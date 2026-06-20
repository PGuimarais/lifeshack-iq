import type { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { createId, jsonStringifySafe, nowIso } from "../db/repositories";
import { agentRuns, toolCalls } from "../db/schema";
import { listActiveMetaConfigs } from "../db/repositories";
import { loadPromptForAgent } from "./prompts";
import { getModelClient, type ModelClient } from "./modelClient";

export type RunAgentInput<TSchema extends z.ZodTypeAny> = {
  workflowType: string;
  promptModuleName: string;
  input?: unknown;
  outputSchema: TSchema;
  client?: ModelClient;
};

export type RunAgentResult<TSchema extends z.ZodTypeAny> = {
  agentRunId: string;
  output: z.infer<TSchema>;
  promptVersion: {
    moduleName: string;
    versionId: string;
    versionNumber: number;
  };
};

export async function runAgent<TSchema extends z.ZodTypeAny>(
  input: RunAgentInput<TSchema>
): Promise<RunAgentResult<TSchema>> {
  const db = getDb();
  const client = input.client ?? getModelClient();
  const prompt = loadPromptForAgent(input.promptModuleName);
  const basePrompt =
    input.promptModuleName === "base_operating_principles"
      ? null
      : loadPromptForAgent("base_operating_principles");
  const activeConfigs = listActiveMetaConfigs();
  const timestamp = nowIso();
  const agentRunId = createId("run");
  const toolCallId = createId("tool");
  const promptVersion = {
    moduleName: prompt.name,
    versionId: prompt.activeVersionId,
    versionNumber: prompt.versionNumber
  };
  const promptVersions = [
    basePrompt
      ? {
          moduleName: basePrompt.name,
          versionId: basePrompt.activeVersionId,
          versionNumber: basePrompt.versionNumber
        }
      : null,
    promptVersion
  ].filter((version): version is typeof promptVersion => Boolean(version));
  const configVersions = activeConfigs.map((config) => ({
    namespace: config.namespace,
    key: config.key,
    versionId: config.versionId,
    versionNumber: config.versionNumber
  }));

  db.insert(agentRuns)
    .values({
      id: agentRunId,
      workflowType: input.workflowType,
      status: "running",
      inputJson: jsonStringifySafe(input.input ?? null),
      outputJson: null,
      model: client.model,
      promptVersionsJson: jsonStringifySafe(promptVersions),
      configVersionsJson: jsonStringifySafe(configVersions),
      startedAt: timestamp,
      finishedAt: null,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .run();

  db.insert(toolCalls)
    .values({
      id: toolCallId,
      agentRunId,
      toolName: `${client.name}.generate_structured`,
      inputJson: jsonStringifySafe({
        workflowType: input.workflowType,
        promptModuleName: input.promptModuleName,
        input: input.input ?? null
      }),
      outputJson: null,
      status: "running",
      error: null,
      createdAt: timestamp,
      finishedAt: null
    })
    .run();

  try {
    const response = await client.generateStructured({
      agentRunId,
      workflowType: input.workflowType,
      promptModuleName: input.promptModuleName,
      basePromptText: basePrompt?.promptText,
      promptText: prompt.promptText,
      input: input.input ?? null,
      metaConfigs: activeConfigs.map((config) => ({
        namespace: config.namespace,
        key: config.key,
        value: config.value
      })),
      outputSchema: input.outputSchema
    });
    const output = input.outputSchema.parse(response.output);
    const finishedAt = nowIso();

    db.update(toolCalls)
      .set({
        outputJson: jsonStringifySafe({
          output,
          rawText: response.rawText,
          toolCalls: response.toolCalls ?? []
        }),
        status: "succeeded",
        finishedAt
      })
      .where(eq(toolCalls.id, toolCallId))
      .run();

    for (const modelToolCall of response.toolCalls ?? []) {
      db.insert(toolCalls)
        .values({
          id: createId("tool"),
          agentRunId,
          toolName: `internal.${modelToolCall.name}`,
          inputJson: jsonStringifySafe(modelToolCall.arguments),
          outputJson: jsonStringifySafe(modelToolCall.output),
          status: "succeeded",
          error: null,
          createdAt: finishedAt,
          finishedAt
        })
        .run();
    }

    db.update(agentRuns)
      .set({
        outputJson: jsonStringifySafe(output),
        status: "succeeded",
        finishedAt,
        updatedAt: finishedAt
      })
      .where(eq(agentRuns.id, agentRunId))
      .run();

    return {
      agentRunId,
      output,
      promptVersion
    };
  } catch (error) {
    const finishedAt = nowIso();
    const message = error instanceof Error ? error.message : String(error);

    db.update(toolCalls)
      .set({
        status: "failed",
        error: message,
        finishedAt
      })
      .where(eq(toolCalls.id, toolCallId))
      .run();
    db.update(agentRuns)
      .set({
        status: "failed",
        error: message,
        finishedAt,
        updatedAt: finishedAt
      })
      .where(eq(agentRuns.id, agentRunId))
      .run();

    throw error;
  }
}
