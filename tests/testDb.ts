import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { closeDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";

export function configureTestDb(testName: string): string {
  closeDb();

  const databasePath = join(tmpdir(), `lifeshack-iq-${testName}-${randomUUID()}.sqlite`);
  process.env.NODE_ENV = "test";
  process.env.DATABASE_PATH = databasePath;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_APP_TOKEN;
  delete process.env.SLACK_SIGNING_SECRET;

  return databasePath;
}

export function removeTestDb(databasePath: string): void {
  closeDb();

  for (const path of [databasePath, `${databasePath}-shm`, `${databasePath}-wal`]) {
    if (existsSync(path)) {
      rmSync(path);
    }
  }
}

export function migrateTestDb(): void {
  runMigrations();
}
