import { afterEach, describe, expect, it } from "vitest";
import type {
  ConnectorHealth,
  ConnectorResult,
  DataConnector,
  DataSourceKind
} from "../src/data/connectors";
import { checkOperationalReadiness, formatReadiness } from "../src/services/readiness";

const originalScheduledWorkflows = process.env.IQ_ENABLE_SCHEDULED_PRODUCTION_WORKFLOWS;
const originalAgentMode = process.env.IQ_AGENT_MODE;
const originalOpenAiKey = process.env.OPENAI_API_KEY;

function restoreEnv(): void {
  if (originalScheduledWorkflows === undefined) {
    delete process.env.IQ_ENABLE_SCHEDULED_PRODUCTION_WORKFLOWS;
  } else {
    process.env.IQ_ENABLE_SCHEDULED_PRODUCTION_WORKFLOWS = originalScheduledWorkflows;
  }

  if (originalAgentMode === undefined) {
    delete process.env.IQ_AGENT_MODE;
  } else {
    process.env.IQ_AGENT_MODE = originalAgentMode;
  }

  if (originalOpenAiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  }
}

function fakeConnector(input: {
  name: string;
  kind?: DataSourceKind;
  requiredForProduction?: boolean;
  health: Partial<ConnectorHealth>;
}): DataConnector {
  return {
    name: input.name,
    kind: input.kind ?? "ops",
    requiredForProduction: input.requiredForProduction,
    health: async () => ({
      name: input.name,
      status: "ok",
      checkedAt: "2026-01-01T00:00:00.000Z",
      mode: "live",
      ...input.health
    }),
    fetch: async (): Promise<ConnectorResult> => ({
      source: input.name,
      kind: input.kind ?? "ops",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      data: {},
      health: {
        name: input.name,
        status: "ok",
        checkedAt: "2026-01-01T00:00:00.000Z"
      }
    })
  };
}

describe("operational readiness", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("is ready when scheduled workflows are enabled and required connectors are healthy", async () => {
    process.env.IQ_ENABLE_SCHEDULED_PRODUCTION_WORKFLOWS = "true";
    process.env.IQ_AGENT_MODE = "fake";

    const readiness = await checkOperationalReadiness({
      connectors: [
        fakeConnector({
          name: "stripe_live_readonly",
          requiredForProduction: true,
          health: { status: "ok", fallbackUsed: false }
        })
      ]
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.checks.every((check) => check.ready)).toBe(true);
  });

  it("blocks scheduling when required connectors use fallback data", async () => {
    process.env.IQ_ENABLE_SCHEDULED_PRODUCTION_WORKFLOWS = "true";
    process.env.IQ_AGENT_MODE = "fake";

    const readiness = await checkOperationalReadiness({
      connectors: [
        fakeConnector({
          name: "posthog_live_readonly",
          requiredForProduction: true,
          health: { status: "ok", fallbackUsed: true }
        })
      ]
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.checks.find((check) => check.name === "required_connectors")?.ready)
      .toBe(false);
    expect(formatReadiness(readiness)).toContain("fallback used");
  });

  it("blocks scheduling until scheduled workflows are explicitly enabled", async () => {
    process.env.IQ_ENABLE_SCHEDULED_PRODUCTION_WORKFLOWS = "false";
    process.env.IQ_AGENT_MODE = "fake";

    const readiness = await checkOperationalReadiness({
      connectors: [
        fakeConnector({
          name: "aws_ops_live_readonly",
          requiredForProduction: true,
          health: { status: "ok", fallbackUsed: false }
        })
      ]
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.productionSchedulingEnabled).toBe(false);
  });

  it("blocks OpenAI agent mode when no API key is configured", async () => {
    process.env.IQ_ENABLE_SCHEDULED_PRODUCTION_WORKFLOWS = "true";
    process.env.IQ_AGENT_MODE = "openai";
    delete process.env.OPENAI_API_KEY;

    const readiness = await checkOperationalReadiness({
      connectors: [
        fakeConnector({
          name: "stripe_live_readonly",
          requiredForProduction: true,
          health: { status: "ok", fallbackUsed: false }
        })
      ]
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.checks.find((check) => check.name === "agent_brain")?.ready)
      .toBe(false);
  });

  it("allows OpenAI agent mode when an API key is configured", async () => {
    process.env.IQ_ENABLE_SCHEDULED_PRODUCTION_WORKFLOWS = "true";
    process.env.IQ_AGENT_MODE = "openai";
    process.env.OPENAI_API_KEY = "sk-test-123";

    const readiness = await checkOperationalReadiness({
      connectors: [
        fakeConnector({
          name: "stripe_live_readonly",
          requiredForProduction: true,
          health: { status: "ok", fallbackUsed: false }
        })
      ]
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.checks.find((check) => check.name === "agent_brain")?.ready)
      .toBe(true);
  });
});
