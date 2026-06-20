import { existsSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLatestBackupRun } from "../src/services/backups";
import { runBackupSqliteWorkflow } from "../src/workflows/backupSqlite";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("backup workflow", () => {
  let databasePath: string;
  let backupDir: string;

  beforeEach(async () => {
    databasePath = configureTestDb("backup-workflow");
    delete process.env.S3_BACKUP_BUCKET;
    backupDir = await mkdtemp(join(tmpdir(), "lifeshack-iq-backup-workflow-"));
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);

    if (existsSync(backupDir)) {
      rmSync(backupDir, { recursive: true, force: true });
    }
  });

  it("runs SQLite backup workflow and persists the backup run", async () => {
    const result = await runBackupSqliteWorkflow({
      source: "test",
      payload: { backupDir }
    });
    const latest = getLatestBackupRun();

    expect(result.status).toBe("succeeded");
    expect(result.backupRunId).toBeTruthy();
    expect(result.summary).toContain("SQLite backup created");
    expect(latest?.status).toBe("succeeded");
    expect(latest?.localPath).toContain(".gz");
  });
});
