import { getDatabasePath, getSqliteDb } from "./client";

export type DbHealth = {
  connected: boolean;
  databasePath: string;
  integrityCheck?: string;
  error?: string;
};

export async function checkDbHealth(): Promise<DbHealth> {
  const databasePath = getDatabasePath();

  try {
    const sqlite = getSqliteDb();
    sqlite.prepare("SELECT 1").get();
    const integrityCheck = String(sqlite.pragma("integrity_check", { simple: true }));

    return {
      connected: true,
      databasePath,
      integrityCheck
    };
  } catch (error) {
    return {
      connected: false,
      databasePath,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main(): Promise<void> {
  const health = await checkDbHealth();

  console.log(`Database connected: ${health.connected ? "yes" : "no"}`);
  console.log(`Path: ${health.databasePath}`);

  if (health.integrityCheck) {
    console.log(`Integrity check: ${health.integrityCheck}`);
  }

  if (health.error) {
    console.error(`Error: ${health.error}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
