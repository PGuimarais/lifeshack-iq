import type { CriticalIssueFinding } from "./types";
import type { PersistedDailySnapshot } from "../data/snapshots/createDailySnapshot";
import { pct } from "./types";

export function detectAtsIssues(snapshot: PersistedDailySnapshot): CriticalIssueFinding[] {
  const findings: CriticalIssueFinding[] = [];

  for (const ats of snapshot.ats) {
    const successRateDrop =
      typeof ats.successRate === "number" && typeof ats.previousSuccessRate === "number"
        ? ats.previousSuccessRate - ats.successRate
        : 0;

    if (ats.status === "outage" || (ats.errorRate ?? 0) >= 0.35 || (ats.successRate ?? 1) <= 0.35) {
      findings.push({
        ruleId: "ats_outage",
        issueKey: `ats_outage:${ats.name}`,
        title: `${ats.name} appears to be in outage`,
        description: `${ats.name} status is ${ats.status}; success rate is ${pct(ats.successRate)} and error rate is ${pct(ats.errorRate)}.`,
        severity: "critical",
        area: "ats",
        evidence: {
          issueKey: `ats_outage:${ats.name}`,
          ats,
          snapshotId: snapshot.id,
          snapshotDate: snapshot.snapshotDate
        },
        recommendation: `Pause or reroute ${ats.name} submissions until the failure mode is understood.`
      });
      continue;
    }

    if (successRateDrop >= 0.2 || (ats.errorRate ?? 0) >= 0.15 || ats.status === "degraded") {
      findings.push({
        ruleId: "ats_success_rate_drop",
        issueKey: `ats_success_rate_drop:${ats.name}`,
        title: `${ats.name} success rate dropped`,
        description: `${ats.name} success rate moved from ${pct(ats.previousSuccessRate)} to ${pct(ats.successRate)}.`,
        severity: successRateDrop >= 0.3 ? "critical" : "medium",
        area: "ats",
        evidence: {
          issueKey: `ats_success_rate_drop:${ats.name}`,
          ats,
          successRateDrop,
          snapshotId: snapshot.id,
          snapshotDate: snapshot.snapshotDate
        },
        recommendation: `Review recent ${ats.name} application attempts and harden the failing path.`
      });
    }
  }

  return findings;
}

export function detectApplicationVolumeIssues(
  snapshot: PersistedDailySnapshot
): CriticalIssueFinding[] {
  const volume = snapshot.appVolume;

  if (!volume.previousSubmitted || volume.previousSubmitted <= 0) {
    return [];
  }

  const dropRatio = (volume.previousSubmitted - volume.submitted) / volume.previousSubmitted;

  if (dropRatio < 0.25) {
    return [];
  }

  return [
    {
      ruleId: "application_volume_drop",
      issueKey: "application_volume_drop:all",
      title: "Application volume dropped",
      description: `Submitted applications dropped from ${volume.previousSubmitted} to ${volume.submitted}.`,
      severity: dropRatio >= 0.5 ? "critical" : "medium",
      area: "applications",
      evidence: {
        issueKey: "application_volume_drop:all",
        volume,
        dropRatio,
        snapshotId: snapshot.id,
        snapshotDate: snapshot.snapshotDate
      },
      recommendation: "Check queue volume, ATS automation health, and upstream job ingestion."
    }
  ];
}

export function detectApplicationSuccessRateIssues(
  snapshot: PersistedDailySnapshot
): CriticalIssueFinding[] {
  const volume = snapshot.appVolume;

  if (
    typeof volume.successRate !== "number" ||
    typeof volume.previousSuccessRate !== "number"
  ) {
    return [];
  }

  const drop = volume.previousSuccessRate - volume.successRate;

  if (drop < 0.15) {
    return [];
  }

  return [
    {
      ruleId: "application_success_rate_drop",
      issueKey: "application_success_rate_drop:all",
      title: "Application success rate dropped",
      description: `Overall success rate moved from ${pct(volume.previousSuccessRate)} to ${pct(volume.successRate)}.`,
      severity: drop >= 0.3 ? "critical" : "medium",
      area: "applications",
      evidence: {
        issueKey: "application_success_rate_drop:all",
        volume,
        drop,
        snapshotId: snapshot.id,
        snapshotDate: snapshot.snapshotDate
      },
      recommendation: "Prioritize recent failed submissions and identify the top failing ATS or form step."
    }
  ];
}
