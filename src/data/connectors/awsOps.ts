import type { DataConnector, OpsSnapshot } from "./types";
import {
  createHardenedConnector,
  fileExists,
  readJsonFile
} from "./hardening";

async function readAwsLiveOps(): Promise<OpsSnapshot> {
  const endpoint = process.env.IQ_AWS_OPS_LIVE_URL;

  if (!endpoint) {
    throw new Error("Set IQ_AWS_OPS_LIVE_URL to a read-only internal ops endpoint.");
  }

  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`AWS ops live endpoint returned ${response.status}.`);
  }

  return (await response.json()) as OpsSnapshot;
}

export function createAwsOpsConnector(): DataConnector<OpsSnapshot> {
  const exportPath = process.env.IQ_AWS_OPS_EXPORT_PATH;
  const liveEnabled = process.env.IQ_AWS_OPS_LIVE_ENABLED === "true";

  return createHardenedConnector<OpsSnapshot>({
    name: liveEnabled ? "aws_ops_live_readonly" : "aws_ops_export",
    kind: "ops",
    mode: liveEnabled ? "live" : "export",
    requiredForProduction: true,
    fallbackData: {},
    isEnabled: () => liveEnabled || fileExists(exportPath),
    disabledMessage:
      "Configure IQ_AWS_OPS_EXPORT_PATH for local export mode or IQ_AWS_OPS_LIVE_ENABLED=true with IQ_AWS_OPS_LIVE_URL for live read-only mode.",
    read: async () => {
      if (liveEnabled) {
        return readAwsLiveOps();
      }

      if (!exportPath) {
        throw new Error("IQ_AWS_OPS_EXPORT_PATH is not configured.");
      }

      return readJsonFile<OpsSnapshot>(exportPath);
    }
  });
}
