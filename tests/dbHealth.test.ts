import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkDbHealth } from "../src/db/health";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("database health", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("db-health");
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("opens the test database and reports integrity", async () => {
    const health = await checkDbHealth();

    expect(health.connected).toBe(true);
    expect(health.databasePath).toBe(databasePath);
    expect(health.integrityCheck).toBe("ok");
  });
});
