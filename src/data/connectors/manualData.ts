import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  ApplicationQualitySnapshot,
  ConnectorHealth,
  ConnectorResult,
  DataConnector,
  DataSourceKind,
  OpsSnapshot,
  ProviderBalanceSnapshot,
  RevenueSnapshot
} from "./types";

type ManualConnectorOptions<TData> = {
  name: string;
  kind: DataSourceKind;
  envPath?: string;
  fixturePath: string;
  fallback: TData;
};

const fixtureRoot = resolve(process.cwd(), "src/data/fixtures");

function nowIso(): string {
  return new Date().toISOString();
}

function readJsonFile<TData>(path: string): TData {
  return JSON.parse(readFileSync(path, "utf8")) as TData;
}

function resolveDataPath(envPath: string | undefined, fixturePath: string): string {
  return envPath ? resolve(envPath) : resolve(fixtureRoot, fixturePath);
}

export function createManualDataConnector<TData>(
  options: ManualConnectorOptions<TData>
): DataConnector<TData> {
  const path = resolveDataPath(options.envPath, options.fixturePath);

  return {
    name: options.name,
    kind: options.kind,
    async health(): Promise<ConnectorHealth> {
      try {
        readJsonFile(path);
        return {
          name: options.name,
          status: "ok",
          checkedAt: nowIso(),
          message: `Loaded ${path}`
        };
      } catch (error) {
        return {
          name: options.name,
          status: "degraded",
          checkedAt: nowIso(),
          message: error instanceof Error ? error.message : String(error)
        };
      }
    },
    async fetch(): Promise<ConnectorResult<TData>> {
      const health = await this.health();
      const data = health.status === "ok" ? readJsonFile<TData>(path) : options.fallback;

      return {
        source: options.name,
        kind: options.kind,
        fetchedAt: nowIso(),
        data,
        health
      };
    }
  };
}

function getProfile(): "good" | "critical" {
  const raw = (process.env.IQ_DATA_PROFILE ?? "good").toLowerCase();
  return raw === "critical" || raw === "bad" ? "critical" : "good";
}

const fallbackOps: OpsSnapshot = {
  applicationVolume: {
    submitted: 0,
    previousSubmitted: 0,
    successRate: 0,
    previousSuccessRate: 0
  },
  ats: [],
  providerBalances: []
};

const fallbackRevenue: RevenueSnapshot = {
  grossRevenueCents: 0,
  mrrCents: 0,
  newSubscriptions: 0,
  cancellations: 0,
  previousCancellations: 0,
  cancellationRate: 0,
  previousCancellationRate: 0
};

const fallbackApplicationQuality: ApplicationQualitySnapshot = {
  totalApplications: 0,
  lowQualityApplications: 0,
  missingResumeCount: 0,
  failedQualityChecks: 0,
  qualityScore: 1,
  previousQualityScore: 1
};

export function getManualDataConnectors(): DataConnector[] {
  const profile = getProfile();

  return [
    createManualDataConnector<OpsSnapshot>({
      name: "manual_ops",
      kind: "ops",
      envPath: process.env.IQ_MANUAL_OPS_PATH,
      fixturePath: profile === "critical" ? "daily-ops-critical.json" : "daily-ops-good.json",
      fallback: fallbackOps
    }),
    createManualDataConnector<RevenueSnapshot>({
      name: "manual_revenue",
      kind: "revenue",
      envPath: process.env.IQ_MANUAL_REVENUE_PATH,
      fixturePath: profile === "critical" ? "revenue-bad.json" : "revenue-normal.json",
      fallback: fallbackRevenue
    }),
    createManualDataConnector<ApplicationQualitySnapshot>({
      name: "manual_application_quality",
      kind: "application_quality",
      envPath: process.env.IQ_MANUAL_APPLICATION_QUALITY_PATH,
      fixturePath:
        profile === "critical" ? "application-quality-critical.json" : "application-quality-good.json",
      fallback: fallbackApplicationQuality
    }),
    createManualDataConnector<ApplicationQualitySnapshot>({
      name: "manual_customer_quality",
      kind: "customer_quality",
      envPath: process.env.IQ_MANUAL_CUSTOMER_QUALITY_PATH,
      fixturePath:
        profile === "critical" ? "application-quality-critical.json" : "application-quality-good.json",
      fallback: fallbackApplicationQuality
    }),
    createManualDataConnector<ProviderBalanceSnapshot[]>({
      name: "manual_provider_balances",
      kind: "provider_balances",
      envPath: process.env.IQ_MANUAL_PROVIDER_BALANCES_PATH,
      fixturePath:
        profile === "critical" ? "provider-balances-bad.json" : "provider-balances-good.json",
      fallback: []
    })
  ];
}
