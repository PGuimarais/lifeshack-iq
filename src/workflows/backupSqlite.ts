import { runSqliteBackup } from "../services/backups";
import type { WorkflowContext, WorkflowResult } from "../services/workflowRegistry";

function getBackupDir(payload: unknown): string | undefined {
  return payload &&
    typeof payload === "object" &&
    "backupDir" in payload &&
    typeof payload.backupDir === "string"
    ? payload.backupDir
    : undefined;
}

export async function runBackupSqliteWorkflow(
  context: WorkflowContext
): Promise<WorkflowResult> {
  const result = await runSqliteBackup({
    backupDir: getBackupDir(context.payload)
  });

  return {
    workflowType: "sqlite_backup_to_s3",
    status: "succeeded",
    summary: result.upload?.uploaded
      ? `SQLite backup created and uploaded to ${result.upload.s3Uri}.`
      : `SQLite backup created locally at ${result.backup.gzipPath}.`,
    backupRunId: result.id,
    details: {
      source: context.source,
      localPath: result.backup.gzipPath,
      checksumPath: result.backup.checksumPath,
      sha256: result.backup.sha256,
      sizeBytes: result.backup.sizeBytes,
      upload: result.upload
    }
  };
}
