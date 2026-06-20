import { existsSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLatestBackupRun, runSqliteBackup } from "../src/services/backups";
import { uploadBackupToS3 } from "../src/backups/s3Upload";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("backups service", () => {
  let databasePath: string;
  let backupDir: string;

  beforeEach(async () => {
    databasePath = configureTestDb("backups");
    delete process.env.S3_BACKUP_BUCKET;
    backupDir = await mkdtemp(join(tmpdir(), "lifeshack-iq-backups-"));
    migrateTestDb();
  });

  afterEach(() => {
    delete process.env.S3_BACKUP_BUCKET;
    delete process.env.S3_BACKUP_PREFIX;
    removeTestDb(databasePath);

    if (existsSync(backupDir)) {
      rmSync(backupDir, { recursive: true, force: true });
    }
  });

  it("creates compressed, checksummed SQLite backups and records backup runs", async () => {
    const result = await runSqliteBackup({ backupDir, upload: false });
    const latest = getLatestBackupRun();

    expect(existsSync(result.backup.gzipPath)).toBe(true);
    expect(existsSync(result.backup.checksumPath)).toBe(true);
    expect(result.backup.sha256).toHaveLength(64);
    expect(result.backup.sizeBytes).toBeGreaterThan(0);
    expect(latest?.status).toBe("succeeded");
    expect(latest?.sha256).toBe(result.backup.sha256);
  });

  it("uploads backup and checksum with aws cli when S3 is configured", async () => {
    process.env.S3_BACKUP_BUCKET = "lifeshack-iq-test";
    process.env.S3_BACKUP_PREFIX = "backups";
    const calls: Array<{ file: string; args: string[] }> = [];

    const result = await uploadBackupToS3(
      {
        sqlitePath: "/tmp/iq.sqlite",
        gzipPath: "/tmp/iq.sqlite.gz",
        checksumPath: "/tmp/iq.sqlite.gz.sha256",
        sha256: "a".repeat(64),
        sizeBytes: 123
      },
      {
        execFile: async (file, args) => {
          calls.push({ file, args });
        }
      }
    );

    expect(result.uploaded).toBe(true);
    expect(result.s3Uri).toBe("s3://lifeshack-iq-test/backups/iq.sqlite.gz");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      file: "aws",
      args: ["s3", "cp", "/tmp/iq.sqlite.gz", "s3://lifeshack-iq-test/backups/iq.sqlite.gz"]
    });
    expect(calls[1]?.args[2]).toBe("/tmp/iq.sqlite.gz.sha256");
  });
});
