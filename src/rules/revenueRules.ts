import type { PersistedDailySnapshot } from "../data/snapshots/createDailySnapshot";
import type { CriticalIssueFinding } from "./types";
import { pct } from "./types";

export function detectRevenueIssues(snapshot: PersistedDailySnapshot): CriticalIssueFinding[] {
  const revenue = snapshot.revenue;
  const findings: CriticalIssueFinding[] = [];

  if (
    typeof revenue.cancellations === "number" &&
    typeof revenue.previousCancellations === "number" &&
    revenue.previousCancellations > 0
  ) {
    const cancellationMultiple = revenue.cancellations / revenue.previousCancellations;

    if (cancellationMultiple >= 2.5 || (revenue.cancellationRate ?? 0) >= 0.1) {
      findings.push({
        ruleId: "cancellation_spike",
        issueKey: "cancellation_spike:subscriptions",
        title: "Cancellation spike detected",
        description: `Cancellations rose from ${revenue.previousCancellations} to ${revenue.cancellations}; cancellation rate is ${pct(revenue.cancellationRate)}.`,
        severity: cancellationMultiple >= 4 || (revenue.cancellationRate ?? 0) >= 0.12 ? "critical" : "medium",
        area: "revenue",
        evidence: {
          issueKey: "cancellation_spike:subscriptions",
          revenue,
          cancellationMultiple,
          snapshotId: snapshot.id,
          snapshotDate: snapshot.snapshotDate
        },
        recommendation: "Review cancellation reasons and recent customer quality or billing changes."
      });
    }
  }

  if (
    typeof revenue.mrrCents === "number" &&
    typeof revenue.previousMrrCents === "number" &&
    revenue.previousMrrCents > 0
  ) {
    const mrrDrop = (revenue.previousMrrCents - revenue.mrrCents) / revenue.previousMrrCents;

    if (mrrDrop >= 0.08) {
      findings.push({
        ruleId: "mrr_drop",
        issueKey: "mrr_drop:subscriptions",
        title: "MRR dropped materially",
        description: `MRR dropped by ${pct(mrrDrop)} versus the previous snapshot.`,
        severity: mrrDrop >= 0.15 ? "critical" : "medium",
        area: "revenue",
        evidence: {
          issueKey: "mrr_drop:subscriptions",
          revenue,
          mrrDrop,
          snapshotId: snapshot.id,
          snapshotDate: snapshot.snapshotDate
        },
        recommendation: "Compare lost subscriptions, refunds, and new subscription volume for the last 24 hours."
      });
    }
  }

  return findings;
}
