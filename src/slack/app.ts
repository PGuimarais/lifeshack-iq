import { App } from "@slack/bolt";
import type { AppConfig } from "../config/env";
import { logger } from "../logger/logger";
import { registerCommandHandlers } from "./commands";
import { registerEventHandlers } from "./events";
import { registerInteractionHandlers } from "./interactions";

export function createSlackApp(config: AppConfig): App | null {
  if (!config.slack.configured) {
    logger.info("Slack disabled: SLACK_BOT_TOKEN, SLACK_APP_TOKEN, and SLACK_SIGNING_SECRET are not all configured.");
    return null;
  }

  const app = new App({
    token: config.slack.botToken,
    appToken: config.slack.appToken,
    signingSecret: config.slack.signingSecret,
    socketMode: true
  });

  registerCommandHandlers(app);
  registerEventHandlers(app);
  registerInteractionHandlers(app);

  return app;
}

export async function startSlackApp(app: App | null): Promise<void> {
  if (!app) {
    return;
  }

  await app.start();
  logger.info("Slack Socket Mode app started.");
}
