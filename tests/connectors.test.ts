import { afterEach, describe, expect, it } from "vitest";
import {
  checkConnectorHealth,
  fetchConnectorData,
  getManualDataConnectors
} from "../src/data/connectors";

describe("connectors", () => {
  const originalProfile = process.env.IQ_DATA_PROFILE;

  afterEach(() => {
    if (originalProfile === undefined) {
      delete process.env.IQ_DATA_PROFILE;
    } else {
      process.env.IQ_DATA_PROFILE = originalProfile;
    }
  });

  it("loads manual fixture data and reports health", async () => {
    process.env.IQ_DATA_PROFILE = "critical";

    const connectors = getManualDataConnectors();
    const health = await checkConnectorHealth(connectors);
    const results = await fetchConnectorData(connectors);

    expect(connectors.length).toBeGreaterThanOrEqual(5);
    expect(health.every((item) => item.status === "ok")).toBe(true);
    expect(results.some((result) => result.kind === "ops")).toBe(true);
    expect(JSON.stringify(results)).toContain("Greenhouse");
  });
});
