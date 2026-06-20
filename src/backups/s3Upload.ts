import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import type { SqliteBackupResult } from "./sqliteBackup";

const execFileAsync = promisify(execFile);

type ExecFileAsync = (file: string, args: string[]) => Promise<unknown>;

export type S3UploadResult = {
  configured: boolean;
  uploaded: boolean;
  s3Uri?: string;
  checksumS3Uri?: string;
  message: string;
};

async function awsS3Cp(
  localPath: string,
  s3Uri: string,
  execFileImpl: ExecFileAsync
): Promise<void> {
  const args = ["s3", "cp", localPath, s3Uri];

  if (process.env.AWS_PROFILE) {
    args.push("--profile", process.env.AWS_PROFILE);
  }

  await execFileImpl("aws", args);
}

export async function uploadBackupToS3(
  backup: SqliteBackupResult,
  input: { execFile?: ExecFileAsync } = {}
): Promise<S3UploadResult> {
  const bucket = process.env.S3_BACKUP_BUCKET;

  if (!bucket) {
    return {
      configured: false,
      uploaded: false,
      message: "S3_BACKUP_BUCKET is not configured; backup kept locally."
    };
  }

  const prefix = process.env.S3_BACKUP_PREFIX ?? "lifeshack-iq/sqlite";
  const s3Uri = `s3://${bucket}/${prefix}/${basename(backup.gzipPath)}`;
  const checksumS3Uri = `${s3Uri}.sha256`;
  const execFileImpl = input.execFile ?? execFileAsync;

  await awsS3Cp(backup.gzipPath, s3Uri, execFileImpl);
  await awsS3Cp(backup.checksumPath, checksumS3Uri, execFileImpl);

  return {
    configured: true,
    uploaded: true,
    s3Uri,
    checksumS3Uri,
    message: "Backup and checksum uploaded to S3."
  };
}
