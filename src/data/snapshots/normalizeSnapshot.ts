import type {
  ApplicationQualitySnapshot,
  ApplicationVolumeSnapshot,
  AtsSnapshot,
  ConnectorResult,
  DailySnapshotInput,
  NormalizedDailySnapshot,
  OpsSnapshot,
  ProviderBalanceSnapshot,
  RevenueSnapshot
} from "../connectors/types";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeObjects<T extends Record<string, unknown>>(base: T, value: unknown): T {
  if (!isRecord(value)) {
    return base;
  }

  return {
    ...base,
    ...value
  };
}

function mergeArrays<T>(base: T[], value: unknown): T[] {
  if (!Array.isArray(value)) {
    return base;
  }

  return [...base, ...(value as T[])];
}

export function normalizeSnapshot(input: DailySnapshotInput): NormalizedDailySnapshot {
  const ops = input.ops ?? {};
  const appVolume = input.appVolume ?? ops.applicationVolume ?? {
    submitted: 0
  };
  const ats = input.ats ?? ops.ats ?? [];
  const providerBalances = input.providerBalances ?? ops.providerBalances ?? [];

  return {
    snapshotDate: input.snapshotDate || todayIsoDate(),
    ops: {
      ...ops,
      applicationVolume: appVolume,
      ats,
      providerBalances
    },
    revenue: input.revenue ?? {},
    appVolume,
    ats,
    customerQuality: input.customerQuality ?? {},
    providerBalances,
    rawSources: input.rawSources ?? {}
  };
}

export function normalizeConnectorResults(
  results: ConnectorResult[],
  snapshotDate = todayIsoDate()
): NormalizedDailySnapshot {
  let ops: OpsSnapshot = {};
  let revenue: RevenueSnapshot = {};
  let appVolume: ApplicationVolumeSnapshot | undefined;
  let ats: AtsSnapshot[] = [];
  let customerQuality: ApplicationQualitySnapshot = {};
  let providerBalances: ProviderBalanceSnapshot[] = [];
  const rawSources: Record<string, unknown> = {};

  for (const result of results) {
    rawSources[result.source] = {
      kind: result.kind,
      fetchedAt: result.fetchedAt,
      health: result.health,
      data: result.data
    };

    if (result.kind === "ops") {
      const data = result.data as OpsSnapshot;
      ops = mergeObjects(ops, data);
      appVolume = data.applicationVolume ?? appVolume;
      ats = mergeArrays(ats, data.ats);
      providerBalances = mergeArrays(providerBalances, data.providerBalances);
    }

    if (result.kind === "revenue") {
      revenue = mergeObjects(revenue, result.data);
    }

    if (result.kind === "application_quality" || result.kind === "customer_quality") {
      customerQuality = mergeObjects(customerQuality, result.data);
    }

    if (result.kind === "provider_balances") {
      providerBalances = mergeArrays(providerBalances, result.data);
    }

    if (result.kind === "ats_health") {
      ats = mergeArrays(ats, result.data);
    }
  }

  return normalizeSnapshot({
    snapshotDate,
    ops,
    revenue,
    appVolume,
    ats,
    customerQuality,
    providerBalances,
    rawSources
  });
}
