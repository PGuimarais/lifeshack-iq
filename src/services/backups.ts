import { desc } from "drizzle-orm";
import { loadConfig } from "../config/env";
import { getDb } from "../db/client";
import {
  completeBackupRun,
  createBackupRunStarted,
  failBackupRun
} from "../db/repositories";
import { backupRuns } from "../db/schema";
import { createSqliteBackup } from "../backups/sqliteBackup";
import { uploadBackupToS3 } from "../backups/s3Upload";

export async function runSqliteBackup(input: {
  backupDir?: string;
  upload?: boolean;
} = {}) {
  const config = loadConfig();
  const backupRun = createBackupRunStarted({
    localPath: config.databasePath
  });

  try {
    const backup = await createSqliteBackup({
      databasePath: config.databasePath,
      backupDir: input.backupDir
    });
    const upload = input.upload === false ? null : await uploadBackupToS3(backup);
    const completed = completeBackupRun(backupRun.id, {
      localPath: backup.gzipPath,
      s3Uri: upload?.s3Uri,
      sha256: backup.sha256,
      sizeBytes: backup.sizeBytes
    });

    return {
      ...completed,
      backup,
      upload
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failBackupRun(backupRun.id, message);
    throw error;
  }
}

export function getLatestBackupRun() {
  return getDb()
    .select()
    .from(backupRuns)
    .orderBy(desc(backupRuns.startedAt))
    .limit(1)
    .get() ?? null;
}

export function formatBackupStatus() {
  const latest = getLatestBackupRun();

  if (!latest) {
    return "No backups have been recorded.";
  }

  return [
    "*Latest SQLite Backup*",
    "",
    `Status: ${latest.status}`,
    `Started: ${latest.startedAt}`,
    `Finished: ${latest.finishedAt ?? "not finished"}`,
    `Local path: ${latest.localPath ?? "none"}`,
    `S3 URI: ${latest.s3Uri ?? "not uploaded"}`,
    `SHA256: ${latest.sha256 ?? "none"}`,
    `Size bytes: ${latest.sizeBytes ?? "unknown"}`,
    latest.error ? `Error: ${latest.error}` : undefined
  ]
    .filter(Boolean)
    .join("\n");
}
