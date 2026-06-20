import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workflowAgentOutputSchema } from "../src/agents/schemas";
import {
  buildOpenAiResponsesBody,
  createOpenAiResponsesClient,
  extractOutputText,
  toOpenAiJsonSchema
} from "../src/agents/openaiResponsesClient";
import { listOpenTasks } from "../src/services/tasks";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.IQ_OPENAI_MODEL;
const originalReasoning = process.env.IQ_OPENAI_REASONING_EFFORT;
const originalVerbosity = process.env.IQ_OPENAI_VERBOSITY;
const originalBaseUrl = process.env.IQ_OPENAI_BASE_URL;

function restoreEnv(): void {
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalApiKey;
  }

  if (originalModel === undefined) {
    delete process.env.IQ_OPENAI_MODEL;
  } else {
    process.env.IQ_OPENAI_MODEL = originalModel;
  }

  if (originalReasoning === undefined) {
    delete process.env.IQ_OPENAI_REASONING_EFFORT;
  } else {
    process.env.IQ_OPENAI_REASONING_EFFORT = originalReasoning;
  }

  if (originalVerbosity === undefined) {
    delete process.env.IQ_OPENAI_VERBOSITY;
  } else {
    process.env.IQ_OPENAI_VERBOSITY = originalVerbosity;
  }

  if (originalBaseUrl === undefined) {
    delete process.env.IQ_OPENAI_BASE_URL;
  } else {
    process.env.IQ_OPENAI_BASE_URL = originalBaseUrl;
  }
}

const generationInput = {
  workflowType: "daily_critical_scan",
  promptModuleName: "daily_critical_scan_prompt",
  basePromptText: "Base principles.",
  promptText: "Analyze operational data.",
  input: { finding: "apps dropped" },
  metaConfigs: [{ key: "safety", value: { refunds_require_approval: true } }],
  outputSchema: workflowAgentOutputSchema
};

describe("OpenAI Responses client", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test-123";
    process.env.IQ_OPENAI_MODEL = "gpt-5.5";
    process.env.IQ_OPENAI_REASONING_EFFORT = "low";
    process.env.IQ_OPENAI_VERBOSITY = "low";
    process.env.IQ_OPENAI_BASE_URL = "https://api.openai.test/v1";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreEnv();
  });

  it("builds a Responses API body with strict structured output", () => {
    const body = buildOpenAiResponsesBody(generationInput);

    expect(body.model).toBe("gpt-5.5");
    expect(body.store).toBe(false);
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.text).toMatchObject({
      verbosity: "low",
      format: {
        type: "json_schema",
        strict: true
      }
    });
    expect(JSON.stringify(body)).toContain("apps dropped");
    expect(JSON.stringify(body)).not.toContain("$schema");
    expect(JSON.stringify(body)).not.toContain("\"default\"");
  });

  it("uses fetch to generate and parse structured output", async () => {
    const output = {
      status: "ok",
      summary: "Critical issue found.",
      observations: ["Application volume dropped."],
      recommendations: ["Notify the team."],
      riskLevel: "high",
      confidence: 0.9
    };
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "resp_123",
          status: "completed",
          output_text: JSON.stringify(output)
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const client = createOpenAiResponsesClient();
    const result = await client.generateStructured(generationInput);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const [url, init] = calls[0]!;

    expect(url).toBe("https://api.openai.test/v1/responses");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer sk-test-123",
      "Content-Type": "application/json"
    });
    expect(result.output).toEqual(output);
  });

  it("executes safe internal tools and continues to final structured output", async () => {
    const databasePath = configureTestDb("openai-tool-loop");
    migrateTestDb();
    const output = {
      status: "ok",
      summary: "Created one follow-up task.",
      observations: ["A task was needed."],
      recommendations: ["Review the task."],
      riskLevel: "low",
      confidence: 0.8
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp_tools",
            status: "completed",
            output: [
              {
                type: "function_call",
                name: "create_task",
                call_id: "call_1",
                arguments: JSON.stringify({
                  name: "Follow up on Stripe data",
                  description: null,
                  issueId: null,
                  initiativeId: null,
                  ownerSlackUserId: null,
                  priority: "medium",
                  dueDate: null
                })
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp_final",
            status: "completed",
            output_text: JSON.stringify(output)
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const client = createOpenAiResponsesClient();
      const result = await client.generateStructured(generationInput);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.toolCalls?.[0]?.name).toBe("create_task");
      expect(listOpenTasks()).toHaveLength(1);
      expect(result.output).toEqual(output);
    } finally {
      removeTestDb(databasePath);
    }
  });

  it("extracts text from output item responses", () => {
    expect(
      extractOutputText({
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "{\"summary\":\"ok\"}" }]
          }
        ]
      })
    ).toBe("{\"summary\":\"ok\"}");
  });

  it("sanitizes Zod JSON schema for OpenAI structured outputs", () => {
    const jsonSchema = toOpenAiJsonSchema(workflowAgentOutputSchema);

    expect(jsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false
    });
    expect(JSON.stringify(jsonSchema)).not.toContain("$schema");
    expect(JSON.stringify(jsonSchema)).not.toContain("\"default\"");
  });

  it("redacts API errors before throwing", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            message: "Bad key sk-test-secret"
          }
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    ) as typeof fetch;

    const client = createOpenAiResponsesClient();

    await expect(client.generateStructured(generationInput)).rejects.toThrow("[redacted]");
  });
});
