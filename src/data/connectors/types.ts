export type ConnectorStatus = "ok" | "disabled" | "degraded" | "error";

export type ConnectorHealth = {
  name: string;
  status: ConnectorStatus;
  checkedAt: string;
  message?: string;
  mode?: "manual" | "export" | "live" | "stub";
  attempts?: number;
  durationMs?: number;
  fallbackUsed?: boolean;
};

export type ConnectorResult<TData = unknown> = {
  source: string;
  kind: DataSourceKind;
  fetchedAt: string;
  data: TData;
  health: ConnectorHealth;
  fallbackUsed?: boolean;
};

export type DataSourceKind =
  | "ops"
  | "revenue"
  | "application_quality"
  | "customer_quality"
  | "provider_balances"
  | "subscriptions"
  | "cancellations"
  | "ats_health"
  | "slack_context"
  | "granola_notes";

export type DataConnector<TData = unknown> = {
  name: string;
  kind: DataSourceKind;
  health: () => Promise<ConnectorHealth>;
  fetch: () => Promise<ConnectorResult<TData>>;
  smokeTest?: () => Promise<ConnectorHealth>;
  requiredForProduction?: boolean;
};

export type AtsStatus = "ok" | "degraded" | "outage" | "unknown";

export type AtsSnapshot = {
  name: string;
  status: AtsStatus;
  successRate?: number;
  previousSuccessRate?: number;
  errorRate?: number;
  applicationsSubmitted?: number;
  applicationsStarted?: number;
  message?: string;
};

export type ApplicationVolumeSnapshot = {
  submitted: number;
  previousSubmitted?: number;
  started?: number;
  successRate?: number;
  previousSuccessRate?: number;
};

export type ProviderBalanceSnapshot = {
  provider: string;
  balanceCents?: number;
  minimumBalanceCents?: number;
  currency?: string;
  missing?: boolean;
};

export type RevenueSnapshot = {
  grossRevenueCents?: number;
  netRevenueCents?: number;
  mrrCents?: number;
  previousMrrCents?: number;
  newSubscriptions?: number;
  cancellations?: number;
  previousCancellations?: number;
  cancellationRate?: number;
  previousCancellationRate?: number;
  refundCents?: number;
};

export type ApplicationQualitySnapshot = {
  totalApplications?: number;
  lowQualityApplications?: number;
  missingResumeCount?: number;
  failedQualityChecks?: number;
  qualityScore?: number;
  previousQualityScore?: number;
};

export type OpsSnapshot = {
  applicationVolume?: ApplicationVolumeSnapshot;
  ats?: AtsSnapshot[];
  providerBalances?: ProviderBalanceSnapshot[];
};

export type DailySnapshotInput = {
  snapshotDate: string;
  ops?: OpsSnapshot;
  revenue?: RevenueSnapshot;
  appVolume?: ApplicationVolumeSnapshot;
  ats?: AtsSnapshot[];
  customerQuality?: ApplicationQualitySnapshot;
  providerBalances?: ProviderBalanceSnapshot[];
  rawSources?: Record<string, unknown>;
};

export type NormalizedDailySnapshot = Required<Omit<DailySnapshotInput, "rawSources">> & {
  id?: string;
  rawSources: Record<string, unknown>;
  createdAt?: string;
};
