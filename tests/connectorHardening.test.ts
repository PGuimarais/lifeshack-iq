import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createHardenedConnector,
  redactSecrets
} from "../src/data/connectors/hardening";

const originalTimeout = process.env.IQ_CONNECTOR_TIMEOUT_MS;
const originalRetries = process.env.IQ_CONNECTOR_RETRIES;

describe("connector hardening", () => {
  beforeEach(() => {
    delete process.env.IQ_CONNECTOR_TIMEOUT_MS;
    delete process.env.IQ_CONNECTOR_RETRIES;
  });

  afterEach(() => {
    if (originalTimeout === undefined) {
      delete process.env.IQ_CONNECTOR_TIMEOUT_MS;
    } else {
      process.env.IQ_CONNECTOR_TIMEOUT_MS = originalTimeout;
    }

    if (originalRetries === undefined) {
      delete process.env.IQ_CONNECTOR_RETRIES;
    } else {
      process.env.IQ_CONNECTOR_RETRIES = originalRetries;
    }
  });

  it("retries transient read failures before returning healthy data", async () => {
    let attempts = 0;
    const connector = createHardenedConnector<{ submitted: number }>({
      name: "transient_ops",
      kind: "ops",
      mode: "live",
      fallbackData: { submitted: 0 },
      retries: 1,
      timeoutMs: 1000,
      isEnabled: () => true,
      read: async () => {
        attempts += 1;

        if (attempts === 1) {
          throw new Error("temporary unavailable");
        }

        return { submitted: 42 };
      }
    });

    const result = await connector.fetch();

    expect(result.data.submitted).toBe(42);
    expect(result.fallbackUsed).toBe(false);
    expect(result.health.status).toBe("ok");
    expect(result.health.attempts).toBe(2);
  });

  it("falls back and redacts provider secrets when a live connector fails", async () => {
    const connector = createHardenedConnector({
      name: "stripe_live_readonly",
      kind: "revenue",
      mode: "live",
      fallbackData: {},
      retries: 0,
      timeoutMs: 1000,
      isEnabled: () => true,
      read: async () => {
        throw new Error("Stripe failed with sk_live_abc123 and token=topsecret");
      }
    });

    const result = await connector.fetch();

    expect(result.data).toEqual({});
    expect(result.fallbackUsed).toBe(true);
    expect(result.health.status).toBe("degraded");
    expect(result.health.message).not.toContain("sk_live_abc123");
    expect(result.health.message).not.toContain("topsecret");
  });

  it("returns fallback data when a connector is disabled", async () => {
    const connector = createHardenedConnector({
      name: "disabled_posthog",
      kind: "application_quality",
      mode: "export",
      fallbackData: { qualityScore: 0 },
      isEnabled: () => false,
      read: async () => ({ qualityScore: 100 })
    });

    const result = await connector.fetch();

    expect(result.data).toEqual({ qualityScore: 0 });
    expect(result.fallbackUsed).toBe(true);
    expect(result.health.status).toBe("disabled");
  });

  it("redacts common token shapes in plain messages", () => {
    const message = redactSecrets(
      "Authorization=Bearer sk_test_secretvalue POSTHOG_API_KEY=phx123456789012345678901"
    );

    expect(message).not.toContain("sk_test_secretvalue");
    expect(message).not.toContain("phx123456789012345678901");
    expect(message).toContain("[redacted]");
  });
});
