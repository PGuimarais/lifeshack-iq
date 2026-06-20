import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getManualDataConnectors } from "../src/data/connectors";
import {
  createDailySnapshot,
  listRecentDailySnapshots
} from "../src/data/snapshots/createDailySnapshot";
import { loadLatestSnapshot } from "../src/data/snapshots/loadLatestSnapshot";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("daily snapshots", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("daily-snapshot");
    process.env.IQ_DATA_PROFILE = "critical";
    migrateTestDb();
  });

  afterEach(() => {
    delete process.env.IQ_DATA_PROFILE;
    removeTestDb(databasePath);
  });

  it("creates and loads a normalized daily snapshot", async () => {
    const snapshot = await createDailySnapshot({
      connectors: getManualDataConnectors(),
      snapshotDate: "2026-06-20"
    });
    const latest = await loadLatestSnapshot({ createIfMissing: false });

    expect(snapshot.id).toMatch(/^snap_/);
    expect(snapshot.snapshotDate).toBe("2026-06-20");
    expect(snapshot.ats.some((ats) => ats.status === "outage")).toBe(true);
    expect(snapshot.providerBalances.some((balance) => balance.missing)).toBe(true);
    expect(latest?.id).toBe(snapshot.id);
    expect(listRecentDailySnapshots(5)).toHaveLength(1);
  });
});
