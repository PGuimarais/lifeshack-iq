import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DataConnector } from "./types";
import {
  createHardenedConnector,
  fileExists,
  hasUsableValue
} from "./hardening";

export type SlackContextSnapshot = {
  notes: string[];
};

export function createSlackContextConnector(): DataConnector<SlackContextSnapshot> {
  const exportPath = process.env.IQ_SLACK_CONTEXT_PATH;
  const liveEnabled = process.env.IQ_SLACK_CONTEXT_LIVE_ENABLED === "true";

  return createHardenedConnector<SlackContextSnapshot>({
    name: liveEnabled ? "slack_context_live_readonly" : "slack_context_export",
    kind: "slack_context",
    mode: liveEnabled ? "live" : "export",
    requiredForProduction: false,
    fallbackData: { notes: [] },
    isEnabled: () =>
      liveEnabled
        ? hasUsableValue(process.env.SLACK_BOT_TOKEN) &&
          hasUsableValue(process.env.IQ_SLACK_CONTEXT_CHANNELS)
        : fileExists(exportPath),
    disabledMessage:
      "Configure IQ_SLACK_CONTEXT_PATH for export mode or IQ_SLACK_CONTEXT_LIVE_ENABLED=true with SLACK_BOT_TOKEN and IQ_SLACK_CONTEXT_CHANNELS for live read-only mode.",
    read: async () => {
      if (!liveEnabled) {
        if (!exportPath) {
          throw new Error("IQ_SLACK_CONTEXT_PATH is not configured.");
        }

        return {
          notes: readFileSync(resolve(exportPath), "utf8")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        };
      }

      const channels = (process.env.IQ_SLACK_CONTEXT_CHANNELS ?? "")
        .split(",")
        .map((channel) => channel.trim())
        .filter(Boolean);
      const limit = Number(process.env.IQ_SLACK_CONTEXT_LIMIT ?? 20);
      const notes: string[] = [];

      for (const channel of channels) {
        const url = new URL("https://slack.com/api/conversations.history");
        url.searchParams.set("channel", channel);
        url.searchParams.set("limit", String(limit));
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`
          }
        });

        if (!response.ok) {
          throw new Error(`Slack history endpoint returned ${response.status}.`);
        }

        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          messages?: Array<{ text?: string; user?: string; ts?: string }>;
        };

        if (!payload.ok) {
          throw new Error(`Slack history error: ${payload.error ?? "unknown_error"}.`);
        }

        for (const message of payload.messages ?? []) {
          if (message.text) {
            notes.push(`[${channel} ${message.ts ?? "unknown"}] ${message.text}`);
          }
        }
      }

      return { notes };
    }
  });
}
