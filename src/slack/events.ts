import type { App } from "@slack/bolt";
import { logger } from "../logger/logger";
import { recordCheckinReply } from "../services/checkins";

type SlackMessageEvent = {
  type?: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  text?: string;
  ts?: string;
  bot_id?: string;
  subtype?: string;
};

export function registerEventHandlers(app: App): void {
  app.event("message", async ({ event, client }) => {
    const message = event as SlackMessageEvent;

    if (
      message.channel_type !== "im" ||
      !message.channel ||
      !message.user ||
      !message.text ||
      message.bot_id ||
      message.subtype
    ) {
      return;
    }

    const recorded = recordCheckinReply({
      slackUserId: message.user,
      channelId: message.channel,
      text: message.text,
      ts: message.ts
    });

    if (!recorded) {
      return;
    }

    await client.chat.postMessage({
      channel: message.channel,
      text: "Got it. I logged this check-in for IQ.",
      thread_ts: message.ts,
      unfurl_links: false,
      unfurl_media: false
    });
    logger.info(
      { checkinId: recorded.id, slackUserId: message.user },
      "Recorded Slack DM check-in reply."
    );
  });
}
