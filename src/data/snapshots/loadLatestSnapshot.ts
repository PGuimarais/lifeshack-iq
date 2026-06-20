import { createDailySnapshot, listRecentDailySnapshots, type PersistedDailySnapshot } from "./createDailySnapshot";

export async function loadLatestSnapshot(input: {
  createIfMissing?: boolean;
} = {}): Promise<PersistedDailySnapshot | null> {
  const [latest] = listRecentDailySnapshots(1);

  if (latest) {
    return latest;
  }

  if (input.createIfMissing === false) {
    return null;
  }

  return createDailySnapshot();
}
