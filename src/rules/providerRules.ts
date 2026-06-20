import type { PersistedDailySnapshot } from "../data/snapshots/createDailySnapshot";
import type { CriticalIssueFinding } from "./types";

export function detectProviderBalanceIssues(
  snapshot: PersistedDailySnapshot
): CriticalIssueFinding[] {
  const balances = snapshot.providerBalances;

  if (balances.length === 0) {
    return [
      {
        ruleId: "provider_balances_missing",
        issueKey: "provider_balances_missing:all",
        title: "Provider balances are missing",
        description: "No provider balance data was available in the latest snapshot.",
        severity: "medium",
        area: "providers",
        evidence: {
          issueKey: "provider_balances_missing:all",
          snapshotId: snapshot.id,
          snapshotDate: snapshot.snapshotDate
        },
        recommendation: "Add provider balance exports or wire a read-only balance adapter."
      }
    ];
  }

  return balances.flatMap((balance) => {
    if (balance.missing) {
      return [
        {
          ruleId: "provider_balance_missing",
          issueKey: `provider_balance_missing:${balance.provider}`,
          title: `${balance.provider} balance is missing`,
          description: `${balance.provider} balance data is unavailable.`,
          severity: "critical" as const,
          area: "providers",
          evidence: {
            issueKey: `provider_balance_missing:${balance.provider}`,
            balance,
            snapshotId: snapshot.id,
            snapshotDate: snapshot.snapshotDate
          },
          recommendation: `Check ${balance.provider} credentials or local balance export before workflows depend on it.`
        }
      ];
    }

    if (
      typeof balance.balanceCents === "number" &&
      typeof balance.minimumBalanceCents === "number" &&
      balance.balanceCents < balance.minimumBalanceCents
    ) {
      return [
        {
          ruleId: "provider_balance_low",
          issueKey: `provider_balance_low:${balance.provider}`,
          title: `${balance.provider} balance is low`,
          description: `${balance.provider} balance is ${balance.balanceCents} cents; minimum is ${balance.minimumBalanceCents} cents.`,
          severity: balance.balanceCents <= balance.minimumBalanceCents / 2 ? "critical" as const : "medium" as const,
          area: "providers",
          evidence: {
            issueKey: `provider_balance_low:${balance.provider}`,
            balance,
            snapshotId: snapshot.id,
            snapshotDate: snapshot.snapshotDate
          },
          recommendation: `Top up ${balance.provider} or reduce dependent workflow volume.`
        }
      ];
    }

    return [];
  });
}
