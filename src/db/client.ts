import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { loadConfig } from "../config/env";
import * as schema from "./schema";

export type DrizzleDatabase = BetterSQLite3Database<typeof schema>;

let sqlite: Database.Database | undefined;
let db: DrizzleDatabase | undefined;

function ensureDatabaseDirectory(databasePath: string): void {
  if (databasePath === ":memory:" || databasePath.startsWith("file:")) {
    return;
  }

  mkdirSync(dirname(resolve(databasePath)), { recursive: true });
}

export function getDatabasePath(): string {
  return loadConfig().databasePath;
}

export function getSqliteDb(): Database.Database {
  if (sqlite) {
    return sqlite;
  }

  const databasePath = getDatabasePath();
  ensureDatabaseDirectory(databasePath);
  sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

export function getDb(): DrizzleDatabase {
  if (db) {
    return db;
  }

  db = drizzle(getSqliteDb(), { schema });
  return db;
}

export function closeDb(): void {
  if (sqlite?.open) {
    sqlite.close();
  }

  sqlite = undefined;
  db = undefined;
}
