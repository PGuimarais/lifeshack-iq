import type { DataConnector, RevenueSnapshot } from "./types";
import {
  createHardenedConnector,
  fileExists,
  hasUsableValue,
  readJsonFile
} from "./hardening";

async function readStripeLiveRevenue(): Promise<RevenueSnapshot> {
  if (!hasUsableValue(process.env.STRIPE_SECRET_KEY)) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  const endpoint = process.env.IQ_STRIPE_LIVE_URL;

  if (!endpoint) {
    throw new Error("Set IQ_STRIPE_LIVE_URL to a read-only internal Stripe revenue endpoint.");
  }

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Stripe-Version": "2026-02-25.clover"
    }
  });

  if (!response.ok) {
    throw new Error(`Stripe live revenue endpoint returned ${response.status}.`);
  }

  return (await response.json()) as RevenueSnapshot;
}

export function createStripeConnector(): DataConnector<RevenueSnapshot> {
  const exportPath = process.env.IQ_STRIPE_EXPORT_PATH;
  const liveEnabled = process.env.IQ_STRIPE_LIVE_ENABLED === "true";

  return createHardenedConnector<RevenueSnapshot>({
    name: liveEnabled ? "stripe_live_readonly" : "stripe_export",
    kind: "revenue",
    mode: liveEnabled ? "live" : "export",
    requiredForProduction: true,
    fallbackData: {},
    isEnabled: () => liveEnabled || fileExists(exportPath),
    disabledMessage:
      "Configure IQ_STRIPE_EXPORT_PATH for local export mode or IQ_STRIPE_LIVE_ENABLED=true with IQ_STRIPE_LIVE_URL for live read-only mode.",
    read: async () => {
      if (liveEnabled) {
        return readStripeLiveRevenue();
      }

      if (!exportPath) {
        throw new Error("IQ_STRIPE_EXPORT_PATH is not configured.");
      }

      return readJsonFile<RevenueSnapshot>(exportPath);
    }
  });
}
