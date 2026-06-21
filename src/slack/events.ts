import type { App } from "@slack/bolt";
import { logger } from "../logger/logger";
import { interpretCheckinReply, recordCheckinReply } from "../services/checkins";

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
      text: "Got it. I logged this check-in and IQ is processing it.",
      thread_ts: message.ts,
      unfurl_links: false,
      unfurl_media: false
    });
    logger.info(
      { checkinId: recorded.id, slackUserId: message.user },
      "Recorded Slack DM check-in reply."
    );

    try {
      const interpreted = await interpretCheckinReply({ checkinId: recorded.id });

      await client.chat.postMessage({
        channel: message.channel,
        text: [
          "IQ processed this check-in.",
          "",
          interpreted.output.summary,
          interpreted.toolCalls.length > 0
            ? `Updates made: ${interpreted.toolCalls.map((call) => call.name).join(", ")}`
            : "Updates made: context recorded."
        ].join("\n"),
        thread_ts: message.ts,
        unfurl_links: false,
        unfurl_media: false
      });
      logger.info(
        {
          checkinId: recorded.id,
          slackUserId: message.user,
          toolCalls: interpreted.toolCalls.map((call) => call.name)
        },
        "Interpreted Slack DM check-in reply."
      );
    } catch (error) {
      logger.error({ err: error, checkinId: recorded.id }, "Failed to interpret check-in reply.");
      await client.chat.postMessage({
        channel: message.channel,
        text: "I logged this check-in, but IQ could not process it automatically. The error was logged locally.",
        thread_ts: message.ts,
        unfurl_links: false,
        unfurl_media: false
      });
    }
  });
}
