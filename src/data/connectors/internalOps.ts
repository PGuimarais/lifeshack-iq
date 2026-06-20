import type { DataConnector, OpsSnapshot } from "./types";
import { createHardenedConnector, hasUsableValue } from "./hardening";

export function createInternalOpsConnector(): DataConnector<OpsSnapshot> {
  const endpoint = process.env.IQ_INTERNAL_OPS_URL;

  return createHardenedConnector<OpsSnapshot>({
    name: endpoint ? "internal_ops_live_readonly" : "internal_ops_stub",
    kind: "ops",
    mode: endpoint ? "live" : "stub",
    requiredForProduction: false,
    fallbackData: {},
    isEnabled: () => hasUsableValue(endpoint),
    disabledMessage:
      "Set IQ_INTERNAL_OPS_URL to enable the read-only internal ops connector.",
    read: async () => {
      if (!endpoint) {
        throw new Error("IQ_INTERNAL_OPS_URL is not configured.");
      }

      const response = await fetch(endpoint, {
        headers: process.env.IQ_INTERNAL_OPS_TOKEN
          ? {
              Authorization: `Bearer ${process.env.IQ_INTERNAL_OPS_TOKEN}`
            }
          : undefined
      });

      if (!response.ok) {
        throw new Error(`Internal ops endpoint returned ${response.status}.`);
      }

      return (await response.json()) as OpsSnapshot;
    }
  });
}
