import type { App } from "@slack/bolt";
import { closeDb } from "./db/client";
import { checkDbHealth } from "./db/health";
import { runMigrations } from "./db/migrate";
import { loadConfig } from "./config/env";
import { logger } from "./logger/logger";
import { startJobWorker, type JobWorkerHandle } from "./services/jobWorker";
import { startScheduler, type SchedulerHandle } from "./services/scheduler";
import { createSlackApp, startSlackApp } from "./slack/app";
import { configureSlackNotifier } from "./slack/notifier";

let keepAliveTimer: NodeJS.Timeout | undefined;
let schedulerHandle: SchedulerHandle | undefined;
let jobWorkerHandle: JobWorkerHandle | undefined;

async function main(): Promise<void> {
  const config = loadConfig();
  logger.info(`${config.appName} starting...`);
  logger.info(`Runtime mode: ${config.runtimeMode}`);

  runMigrations();
  const dbHealth = await checkDbHealth();
  logger.info(`Database: ${dbHealth.connected ? "connected" : "not connected"}`);

  const slackApp = createSlackApp(config);
  logger.info(`Slack: ${slackApp ? "configured" : "not configured"}`);
  configureSlackNotifier(slackApp);
  await startSlackApp(slackApp);
  schedulerHandle = startScheduler();
  jobWorkerHandle = startJobWorker();

  logger.info(`${config.appName} online`);
  keepAliveTimer = setInterval(() => undefined, 60_000);
  registerShutdownHandlers(slackApp);
}

function registerShutdownHandlers(slackApp: App | null): void {
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ signal }, "LifeShack IQ shutting down...");

    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
    }
    schedulerHandle?.stop();
    jobWorkerHandle?.stop();

    try {
      await slackApp?.stop();
    } catch (error) {
      logger.error({ err: error }, "Failed to stop Slack app cleanly");
    } finally {
      closeDb();
    }

    logger.info("LifeShack IQ offline");
    process.exit(0);
  };

  process.once("SIGINT", (signal) => {
    void shutdown(signal);
  });
  process.once("SIGTERM", (signal) => {
    void shutdown(signal);
  });
}

void main().catch((error) => {
  logger.error({ err: error }, "LifeShack IQ failed to start");
  closeDb();
  process.exit(1);
});
