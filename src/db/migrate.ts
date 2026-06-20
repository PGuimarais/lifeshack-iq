import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { closeDb, getDb } from "./client";
import { seedDefaults } from "./repositories";

export function runMigrations(): void {
  migrate(getDb(), { migrationsFolder: "./drizzle/migrations" });
  seedDefaults();
}

async function main(): Promise<void> {
  try {
    runMigrations();
    console.log("Database migrations applied.");
    console.log("Default meta config and prompt modules seeded.");
  } finally {
    closeDb();
  }
}

if (require.main === module) {
  void main();
}
