import { loadConfig } from "../config/env";
import { checkDbHealth } from "../db/health";

const startedAt = new Date();

export type RuntimeStatus = {
  appName: string;
  runtimeMode: string;
  database: {
    connected: boolean;
    path: string;
  };
  slack: {
    configured: boolean;
    connected?: boolean;
  };
  startedAt: string;
  uptimeSeconds: number;
};

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  const config = loadConfig();
  const dbHealth = await checkDbHealth();

  return {
    appName: config.appName,
    runtimeMode: config.runtimeMode,
    database: {
      connected: dbHealth.connected,
      path: dbHealth.databasePath
    },
    slack: {
      configured: config.slack.configured,
      connected: config.slack.configured ? true : undefined
    },
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000)
  };
}
