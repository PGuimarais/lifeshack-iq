import { desc } from "drizzle-orm";
import { getDb } from "../../db/client";
import { createId, jsonParseSafe, jsonStringifySafe, nowIso } from "../../db/repositories";
import { dailySnapshots } from "../../db/schema";
import {
  fetchConnectorData,
  getDefaultConnectors,
  type DataConnector,
  type NormalizedDailySnapshot
} from "../connectors";
import { normalizeConnectorResults, normalizeSnapshot } from "./normalizeSnapshot";

export type PersistedDailySnapshot = NormalizedDailySnapshot & {
  id: string;
  createdAt: string;
};

function mapSnapshotRow(row: typeof dailySnapshots.$inferSelect): PersistedDailySnapshot {
  const ops = jsonParseSafe(row.opsJson, {});
  const revenue = jsonParseSafe(row.revenueJson, {});
  const appVolume = jsonParseSafe(row.appVolumeJson, { submitted: 0 });
  const ats = jsonParseSafe(row.atsJson, []);
  const customerQuality = jsonParseSafe(row.customerQualityJson, {});
  const rawSources = jsonParseSafe(row.rawSourcesJson, {});
  const normalized = normalizeSnapshot({
    snapshotDate: row.snapshotDate,
    ops,
    revenue,
    appVolume,
    ats,
    customerQuality,
    rawSources
  });

  return {
    ...normalized,
    id: row.id,
    createdAt: row.createdAt
  };
}

export function persistDailySnapshot(snapshot: NormalizedDailySnapshot): PersistedDailySnapshot {
  const normalized = normalizeSnapshot(snapshot);
  const row = {
    id: createId("snap"),
    snapshotDate: normalized.snapshotDate,
    revenueJson: jsonStringifySafe(normalized.revenue),
    opsJson: jsonStringifySafe(normalized.ops),
    appVolumeJson: jsonStringifySafe(normalized.appVolume),
    atsJson: jsonStringifySafe(normalized.ats),
    customerQualityJson: jsonStringifySafe(normalized.customerQuality),
    rawSourcesJson: jsonStringifySafe({
      ...normalized.rawSources,
      providerBalances: normalized.providerBalances
    }),
    createdAt: nowIso()
  };

  getDb().insert(dailySnapshots).values(row).run();
  return mapSnapshotRow(row);
}

export async function createDailySnapshot(input: {
  connectors?: DataConnector[];
  snapshotDate?: string;
} = {}): Promise<PersistedDailySnapshot> {
  const results = await fetchConnectorData(input.connectors ?? getDefaultConnectors());
  const snapshot = normalizeConnectorResults(results, input.snapshotDate);

  return persistDailySnapshot(snapshot);
}

export function listRecentDailySnapshots(limit = 5): PersistedDailySnapshot[] {
  return getDb()
    .select()
    .from(dailySnapshots)
    .orderBy(desc(dailySnapshots.createdAt))
    .limit(limit)
    .all()
    .map(mapSnapshotRow);
}
