import { createReadStream, createWriteStream, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { getSqliteDb } from "../db/client";
import { sha256File, writeSha256Sidecar } from "./checksum";

export type SqliteBackupResult = {
  sqlitePath: string;
  gzipPath: string;
  checksumPath: string;
  sha256: string;
  sizeBytes: number;
};

function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function createSqliteBackup(input: {
  databasePath: string;
  backupDir?: string;
}): Promise<SqliteBackupResult> {
  const backupDir = resolve(input.backupDir ?? "./data/backups");
  mkdirSync(backupDir, { recursive: true });

  const backupBaseName = `${basename(input.databasePath).replace(/[^a-zA-Z0-9_.-]/g, "_")}-${safeTimestamp()}`;
  const sqlitePath = resolve(backupDir, `${backupBaseName}.sqlite`);
  const gzipPath = `${sqlitePath}.gz`;

  if (input.databasePath === ":memory:") {
    const memoryPath = resolve(tmpdir(), `lifeshack-iq-memory-${safeTimestamp()}.sqlite`);
    await getSqliteDb().backup(memoryPath);
    await pipeline(createReadStream(memoryPath), createGzip(), createWriteStream(gzipPath));
  } else {
    mkdirSync(dirname(sqlitePath), { recursive: true });
    await getSqliteDb().backup(sqlitePath);
    await pipeline(createReadStream(sqlitePath), createGzip(), createWriteStream(gzipPath));
  }

  const sha256 = await sha256File(gzipPath);
  const checksumPath = writeSha256Sidecar({
    filePath: gzipPath,
    sha256
  });
  const sizeBytes = statSync(gzipPath).size;

  return {
    sqlitePath,
    gzipPath,
    checksumPath,
    sha256,
    sizeBytes
  };
}
