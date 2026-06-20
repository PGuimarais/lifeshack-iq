import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getRuntimeStatus } from "../src/services/runtimeStatus";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("runtime status", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("runtime-status");
    process.env.IQ_APP_NAME = "LifeShack IQ";
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("returns app, database, and Slack status", async () => {
    const status = await getRuntimeStatus();

    expect(status.appName).toBe("LifeShack IQ");
    expect(status.database.connected).toBe(true);
    expect(status.database.path).toBe(databasePath);
    expect(status.slack.configured).toBe(false);
    expect(status.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
