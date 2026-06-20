import { createAwsOpsConnector } from "./awsOps";
import { createGranolaNotesConnector } from "./granolaNotes";
import { createInternalOpsConnector } from "./internalOps";
import { getManualDataConnectors } from "./manualData";
import { createPosthogConnector } from "./posthog";
import { createSlackContextConnector } from "./slackContext";
import { createStripeConnector } from "./stripe";
import type { ConnectorHealth, ConnectorResult, DataConnector } from "./types";

export function getDefaultConnectors(): DataConnector[] {
  return [
    ...getManualDataConnectors(),
    createStripeConnector(),
    createPosthogConnector(),
    createAwsOpsConnector(),
    createInternalOpsConnector(),
    createSlackContextConnector(),
    createGranolaNotesConnector()
  ];
}

export async function checkConnectorHealth(
  connectors: DataConnector[] = getDefaultConnectors()
): Promise<ConnectorHealth[]> {
  return Promise.all(connectors.map((connector) => connector.health()));
}

export async function fetchConnectorData(
  connectors: DataConnector[] = getDefaultConnectors()
): Promise<ConnectorResult[]> {
  return Promise.all(connectors.map((connector) => connector.fetch()));
}

export * from "./types";
export { getManualDataConnectors };
