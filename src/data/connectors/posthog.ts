import type { ApplicationQualitySnapshot, DataConnector } from "./types";
import {
  createHardenedConnector,
  fileExists,
  hasUsableValue,
  readJsonFile
} from "./hardening";

async function readPosthogLiveQuality(): Promise<ApplicationQualitySnapshot> {
  const apiKey = process.env.POSTHOG_API_KEY;
  const endpoint = process.env.IQ_POSTHOG_LIVE_URL;

  if (!hasUsableValue(apiKey)) {
    throw new Error("POSTHOG_API_KEY is not configured.");
  }

  if (!endpoint) {
    throw new Error("Set IQ_POSTHOG_LIVE_URL to a read-only internal PostHog quality endpoint.");
  }

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`PostHog live endpoint returned ${response.status}.`);
  }

  return (await response.json()) as ApplicationQualitySnapshot;
}

export function createPosthogConnector(): DataConnector<ApplicationQualitySnapshot> {
  const exportPath = process.env.IQ_POSTHOG_EXPORT_PATH;
  const liveEnabled = process.env.IQ_POSTHOG_LIVE_ENABLED === "true";

  return createHardenedConnector<ApplicationQualitySnapshot>({
    name: liveEnabled ? "posthog_live_readonly" : "posthog_export",
    kind: "application_quality",
    mode: liveEnabled ? "live" : "export",
    requiredForProduction: true,
    fallbackData: {},
    isEnabled: () => liveEnabled || fileExists(exportPath),
    disabledMessage:
      "Configure IQ_POSTHOG_EXPORT_PATH for local export mode or IQ_POSTHOG_LIVE_ENABLED=true with IQ_POSTHOG_LIVE_URL for live read-only mode.",
    read: async () => {
      if (liveEnabled) {
        return readPosthogLiveQuality();
      }

      if (!exportPath) {
        throw new Error("IQ_POSTHOG_EXPORT_PATH is not configured.");
      }

      return readJsonFile<ApplicationQualitySnapshot>(exportPath);
    }
  });
}
