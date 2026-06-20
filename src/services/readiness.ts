import {
  checkConnectorHealth,
  getDefaultConnectors,
  type ConnectorHealth,
  type DataConnector
} from "../data/connectors";
import { hasUsableValue } from "../data/connectors/hardening";

export type ReadinessCheck = {
  name: string;
  ready: boolean;
  message: string;
  details?: unknown;
};

export type OperationalReadiness = {
  ready: boolean;
  checkedAt: string;
  productionSchedulingEnabled: boolean;
  checks: ReadinessCheck[];
  connectorHealth: ConnectorHealth[];
};

type RequiredConnectorFailure = {
  connectorName: string;
  health?: ConnectorHealth;
};

function nowIso(): string {
  return new Date().toISOString();
}

function productionSchedulingEnabled(): boolean {
  return process.env.IQ_ENABLE_SCHEDULED_PRODUCTION_WORKFLOWS === "true";
}

function agentMode(): string {
  return process.env.IQ_AGENT_MODE ?? "fake";
}

function agentReady(): boolean {
  const mode = agentMode();

  if (mode === "fake") {
    return true;
  }

  return (mode === "openai" || mode === "real") && hasUsableValue(process.env.OPENAI_API_KEY);
}

export async function checkOperationalReadiness(input: {
  connectors?: DataConnector[];
} = {}): Promise<OperationalReadiness> {
  const connectors = input.connectors ?? getDefaultConnectors();
  const connectorHealth = await checkConnectorHealth(connectors);
  const requiredConnectors = connectors.filter((connector) => connector.requiredForProduction);
  const requiredHealthByName = new Map(
    connectorHealth.map((health) => [health.name, health])
  );
  const requiredConnectorFailures = requiredConnectors.reduce<RequiredConnectorFailure[]>(
    (failures, connector) => {
      const health = requiredHealthByName.get(connector.name);

      if (!health || health.status !== "ok" || health.fallbackUsed === true) {
        failures.push({ connectorName: connector.name, health });
      }

      return failures;
    },
    []
  );
  const schedulingEnabled = productionSchedulingEnabled();
  const checks: ReadinessCheck[] = [
    {
      name: "production_scheduling_enabled",
      ready: schedulingEnabled,
      message: schedulingEnabled
        ? "Scheduled production workflows are explicitly enabled."
        : "Set IQ_ENABLE_SCHEDULED_PRODUCTION_WORKFLOWS=true to enable scheduled production workflows."
    },
    {
      name: "required_connectors",
      ready: requiredConnectorFailures.length === 0,
      message:
        requiredConnectorFailures.length === 0
          ? "All required production connectors are healthy."
          : "One or more required production connectors is not ready.",
      details: requiredConnectorFailures.map((health) => ({
        name: health.health?.name ?? health.connectorName,
        status: health.health?.status ?? "missing",
        mode: health.health?.mode,
        fallbackUsed: health.health?.fallbackUsed,
          message: health.health?.message ?? "Connector did not return a health result."
      }))
    },
    {
      name: "agent_brain",
      ready: agentReady(),
      message: agentReady()
        ? `Agent mode ${agentMode()} is ready.`
        : "Set OPENAI_API_KEY or use IQ_AGENT_MODE=fake before enabling scheduled agent workflows.",
      details: {
        mode: agentMode(),
        openAiConfigured: hasUsableValue(process.env.OPENAI_API_KEY)
      }
    }
  ];
  const ready = checks.every((check) => check.ready);

  return {
    ready,
    checkedAt: nowIso(),
    productionSchedulingEnabled: schedulingEnabled,
    checks,
    connectorHealth
  };
}

export function formatReadiness(readiness: OperationalReadiness): string {
  return [
    "*LifeShack IQ Readiness*",
    "",
    `Ready for scheduled production workflows: ${readiness.ready ? "yes" : "no"}`,
    `Checked at: ${readiness.checkedAt}`,
    "",
    "*Checks*",
    ...readiness.checks.map(
      (check) => `- ${check.ready ? "ok" : "blocked"} ${check.name}: ${check.message}`
    ),
    "",
    "*Connectors*",
    ...readiness.connectorHealth.map((health) => {
      const fallback = health.fallbackUsed ? ", fallback used" : "";
      return `- ${health.name}: ${health.status}${health.mode ? ` (${health.mode})` : ""}${fallback}`;
    })
  ].join("\n");
}
