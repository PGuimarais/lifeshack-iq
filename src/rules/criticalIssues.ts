import type { PersistedDailySnapshot } from "../data/snapshots/createDailySnapshot";
import type { CriticalIssueFinding } from "./types";
import { pct } from "./types";

const severityRank = {
  critical: 3,
  medium: 2,
  low: 1
};

export function detectCriticalIssues(snapshot: PersistedDailySnapshot): CriticalIssueFinding[] {
  const findings: CriticalIssueFinding[] = [];

  for (const ats of snapshot.ats) {
    const submittedZeroAfterWork =
      ats.applicationsSubmitted === 0 &&
      (ats.applicationsStarted ?? 0) > 0;
    const successRateZeroAfterPriorSuccess =
      ats.successRate === 0 &&
      (ats.previousSuccessRate ?? 0) > 0;

    if (ats.status === "outage" || submittedZeroAfterWork || successRateZeroAfterPriorSuccess) {
      findings.push({
        ruleId: "ats_obvious_failure",
        issueKey: `ats_obvious_failure:${ats.name}`,
        title: `${ats.name} has an obvious application failure`,
        description: `${ats.name} status is ${ats.status}; submitted=${ats.applicationsSubmitted ?? "unknown"}, started=${ats.applicationsStarted ?? "unknown"}, success=${pct(ats.successRate)}.`,
        severity: "critical",
        area: "ats",
        evidence: {
          issueKey: `ats_obvious_failure:${ats.name}`,
          ats,
          snapshotId: snapshot.id,
          snapshotDate: snapshot.snapshotDate
        },
        recommendation: `Treat ${ats.name} as a likely outage or hard automation failure until verified.`
      });
    }
  }

  if ((snapshot.appVolume.previousSubmitted ?? 0) > 0 && snapshot.appVolume.submitted === 0) {
    findings.push({
      ruleId: "application_zero_submissions",
      issueKey: "application_zero_submissions:all",
      title: "Applications dropped to zero",
      description: `Submitted applications dropped from ${snapshot.appVolume.previousSubmitted} to 0.`,
      severity: "critical",
      area: "applications",
      evidence: {
        issueKey: "application_zero_submissions:all",
        volume: snapshot.appVolume,
        snapshotId: snapshot.id,
        snapshotDate: snapshot.snapshotDate
      },
      recommendation: "Check job ingestion, queue enqueueing, and application automation immediately."
    });
  }

  if (
    (snapshot.appVolume.previousSuccessRate ?? 0) > 0 &&
    snapshot.appVolume.successRate === 0
  ) {
    findings.push({
      ruleId: "application_zero_success_rate",
      issueKey: "application_zero_success_rate:all",
      title: "Application success rate dropped to zero",
      description: `Overall success rate moved from ${pct(snapshot.appVolume.previousSuccessRate)} to 0%.`,
      severity: "critical",
      area: "applications",
      evidence: {
        issueKey: "application_zero_success_rate:all",
        volume: snapshot.appVolume,
        snapshotId: snapshot.id,
        snapshotDate: snapshot.snapshotDate
      },
      recommendation: "Pause automatic assumptions and inspect recent failed application attempts."
    });
  }

  for (const balance of snapshot.providerBalances) {
    if (balance.missing || (typeof balance.balanceCents === "number" && balance.balanceCents <= 0)) {
      findings.push({
        ruleId: "provider_obvious_failure",
        issueKey: `provider_obvious_failure:${balance.provider}`,
        title: `${balance.provider} provider appears unavailable or out of credits`,
        description: balance.missing
          ? `${balance.provider} balance data is missing.`
          : `${balance.provider} balance is ${balance.balanceCents} cents.`,
        severity: "critical",
        area: "providers",
        evidence: {
          issueKey: `provider_obvious_failure:${balance.provider}`,
          balance,
          snapshotId: snapshot.id,
          snapshotDate: snapshot.snapshotDate
        },
        recommendation: `Verify ${balance.provider} access, billing, and credit availability.`
      });
    }
  }

  return findings.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
}
