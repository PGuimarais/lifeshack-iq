import { z } from "zod";
import { redactSecrets } from "../data/connectors/hardening";
import type {
  ModelClient,
  StructuredGenerationInput,
  StructuredGenerationResult
} from "./modelClient";
import {
  executeInternalTool,
  getOpenAiToolDefinitions,
  type AgentInternalToolCall
} from "./internalTools";

type JsonObject = Record<string, unknown>;

type OpenAiResponseBody = {
  id?: string;
  status?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
  incomplete_details?: {
    reason?: string;
  };
  error?: {
    message?: string;
    type?: string;
  };
  usage?: unknown;
};

const defaultModel = "gpt-5.5";
const defaultBaseUrl = "https://api.openai.com/v1";

function hasUsableSecret(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && !normalized.includes("your-") && normalized !== "changeme";
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeSchema);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const source = value as JsonObject;
  const sanitized: JsonObject = {};

  for (const [key, nestedValue] of Object.entries(source)) {
    if (key === "$schema" || key === "default") {
      continue;
    }

    sanitized[key] = sanitizeSchema(nestedValue);
  }

  if (sanitized.type === "object" && sanitized.properties && sanitized.additionalProperties === undefined) {
    sanitized.additionalProperties = false;
  }

  return sanitized;
}

export function toOpenAiJsonSchema(schema: z.ZodTypeAny): JsonObject {
  const jsonSchema = sanitizeSchema(z.toJSONSchema(schema));

  if (!jsonSchema || typeof jsonSchema !== "object" || Array.isArray(jsonSchema)) {
    throw new Error("OpenAI structured output schema must be a JSON object.");
  }

  return jsonSchema as JsonObject;
}

function schemaName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/^_+/, "")
    .slice(0, 64) || "lifeshack_iq_output";
}

function jsonForPrompt(value: unknown): string {
  return redactSecrets(JSON.stringify(value ?? null, null, 2));
}

function buildSystemPrompt(input: StructuredGenerationInput): string {
  return [
    input.basePromptText ??
      "You are LifeShack IQ, an internal operating system for LifeShack.",
    "",
    input.promptText,
    "",
    "Operating rules:",
    "- Use only the supplied business context as evidence.",
    "- Separate facts, inferences, risks, and recommended actions.",
    "- Be concise, operationally useful, and specific about owners or next steps when evidence supports them.",
    "- Use safe internal tools when they materially help: read issues, create concrete tasks, create initiatives, propose or update goals, record context notes, or request approvals.",
    "- Do not claim to execute refunds, emails, transactions, AWS changes, or production changes.",
    "- Any sensitive action must remain a recommendation that requires explicit approval."
  ].join("\n");
}

export function buildOpenAiResponsesBody(input: StructuredGenerationInput): JsonObject {
  const model = process.env.IQ_OPENAI_MODEL ?? defaultModel;
  const reasoningEffort = process.env.IQ_OPENAI_REASONING_EFFORT ?? "low";
  const verbosity = process.env.IQ_OPENAI_VERBOSITY ?? "low";
  const maxOutputTokens = numberFromEnv("IQ_OPENAI_MAX_OUTPUT_TOKENS", 1200);

  return {
    model,
    store: false,
    input: [
      {
        role: "system",
        content: buildSystemPrompt(input)
      },
      {
        role: "user",
        content: jsonForPrompt({
          workflowType: input.workflowType,
          promptModuleName: input.promptModuleName,
          businessInput: input.input,
          activeMetaConfigs: input.metaConfigs ?? []
        })
      }
    ],
    reasoning: {
      effort: reasoningEffort
    },
    tools: getOpenAiToolDefinitions(),
    text: {
      verbosity,
      format: {
        type: "json_schema",
        name: schemaName(`${input.promptModuleName}_output`),
        schema: toOpenAiJsonSchema(input.outputSchema),
        strict: true
      }
    },
    max_output_tokens: maxOutputTokens
  };
}

function extractFunctionCalls(body: OpenAiResponseBody) {
  return (body.output ?? []).filter(
    (item): item is { type: "function_call"; name: string; call_id: string; arguments: string } =>
      item.type === "function_call" &&
      typeof item.name === "string" &&
      typeof item.call_id === "string" &&
      typeof item.arguments === "string"
  );
}

function extractFromOutputItems(body: OpenAiResponseBody): string | undefined {
  for (const output of body.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.refusal) {
        throw new Error(`OpenAI refused the request: ${content.refusal}`);
      }

      if (content.text) {
        return content.text;
      }
    }
  }

  return undefined;
}

export function extractOutputText(body: OpenAiResponseBody): string {
  if (body.status === "incomplete") {
    throw new Error(
      `OpenAI response was incomplete${body.incomplete_details?.reason ? `: ${body.incomplete_details.reason}` : "."}`
    );
  }

  const text = body.output_text ?? extractFromOutputItems(body);

  if (!text) {
    throw new Error("OpenAI response did not include output text.");
  }

  return text;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

export function createOpenAiResponsesClient(): ModelClient {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.IQ_OPENAI_MODEL ?? defaultModel;
  const baseUrl = process.env.IQ_OPENAI_BASE_URL ?? defaultBaseUrl;
  const timeoutMs = numberFromEnv("IQ_OPENAI_TIMEOUT_MS", 60_000);

  if (!hasUsableSecret(apiKey)) {
    throw new Error("OPENAI_API_KEY is required when IQ_AGENT_MODE=openai.");
  }

  return {
    name: "openai_responses",
    model,
    async generateStructured(
      input: StructuredGenerationInput
    ): Promise<StructuredGenerationResult> {
      const endpoint = `${baseUrl.replace(/\/$/, "")}/responses`;
      const baseBody = buildOpenAiResponsesBody(input);
      const messages = [...(baseBody.input as unknown[])];
      const toolCalls: AgentInternalToolCall[] = [];
      let responseBody: OpenAiResponseBody | null = null;

      for (let turn = 0; turn < 5; turn += 1) {
        const response = await fetchWithTimeout(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ...baseBody,
            input: messages
          })
        }, timeoutMs);
        responseBody = (await response.json().catch(() => ({}))) as OpenAiResponseBody;

        if (!response.ok) {
          const message = responseBody.error?.message ?? `OpenAI Responses API returned ${response.status}.`;
          throw new Error(redactSecrets(message));
        }

        const functionCalls = extractFunctionCalls(responseBody);

        if (functionCalls.length === 0) {
          break;
        }

        messages.push(...(responseBody.output ?? []));

        for (const call of functionCalls) {
          const parsedArgs = JSON.parse(call.arguments) as unknown;
          const output = await executeInternalTool(call.name, parsedArgs, {
            proposedByRunId: input.agentRunId
          });
          toolCalls.push({
            name: call.name,
            arguments: parsedArgs,
            output
          });
          messages.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify(output)
          });
        }
      }

      if (!responseBody) {
        throw new Error("OpenAI Responses API did not return a response.");
      }

      const rawText = extractOutputText(responseBody);

      return {
        output: JSON.parse(rawText) as unknown,
        rawText,
        toolCalls
      };
    }
  };
}
