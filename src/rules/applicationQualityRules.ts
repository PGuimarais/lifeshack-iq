import type { PersistedDailySnapshot } from "../data/snapshots/createDailySnapshot";
import type { CriticalIssueFinding } from "./types";
import { pct } from "./types";

export function detectApplicationQualityIssues(
  snapshot: PersistedDailySnapshot
): CriticalIssueFinding[] {
  const quality = snapshot.customerQuality;
  const total = quality.totalApplications ?? snapshot.appVolume.submitted;
  const findings: CriticalIssueFinding[] = [];

  if (total > 0 && typeof quality.lowQualityApplications === "number") {
    const lowQualityRate = quality.lowQualityApplications / total;

    if (lowQualityRate >= 0.2) {
      findings.push({
        ruleId: "application_quality_low",
        issueKey: "application_quality_low:all",
        title: "Application quality issue detected",
        description: `${quality.lowQualityApplications} of ${total} applications were low quality (${pct(lowQualityRate)}).`,
        severity: lowQualityRate >= 0.3 ? "critical" : "medium",
        area: "application_quality",
        evidence: {
          issueKey: "application_quality_low:all",
          quality,
          lowQualityRate,
          snapshotId: snapshot.id,
          snapshotDate: snapshot.snapshotDate
        },
        recommendation: "Audit generated answers, resume attachment handling, and screening-question completeness."
      });
    }
  }

  if ((quality.missingResumeCount ?? 0) >= 5) {
    findings.push({
      ruleId: "application_missing_resume",
      issueKey: "application_missing_resume:all",
      title: "Applications are missing resumes",
      description: `${quality.missingResumeCount} applications were missing resumes.`,
      severity: (quality.missingResumeCount ?? 0) >= 10 ? "critical" : "medium",
      area: "application_quality",
      evidence: {
        issueKey: "application_missing_resume:all",
        quality,
        snapshotId: snapshot.id,
        snapshotDate: snapshot.snapshotDate
      },
      recommendation: "Inspect upload paths and validate that candidate resume assets are available before submit."
    });
  }

  if (
    typeof quality.qualityScore === "number" &&
    typeof quality.previousQualityScore === "number" &&
    quality.previousQualityScore - quality.qualityScore >= 0.2
  ) {
    findings.push({
      ruleId: "application_quality_score_drop",
      issueKey: "application_quality_score_drop:all",
      title: "Application quality score dropped",
      description: `Quality score moved from ${pct(quality.previousQualityScore)} to ${pct(quality.qualityScore)}.`,
      severity: quality.qualityScore < 0.7 ? "critical" : "medium",
      area: "application_quality",
      evidence: {
        issueKey: "application_quality_score_drop:all",
        quality,
        snapshotId: snapshot.id,
        snapshotDate: snapshot.snapshotDate
      },
      recommendation: "Review the prompt/config versions used for recent applications."
    });
  }

  return findings;
}
