import type { PersistedDailySnapshot } from "../data/snapshots/createDailySnapshot";
import type { CriticalIssueFinding } from "../rules/types";
import {
  buildApplicationQualitySection,
  buildAtsSection,
  buildExecutiveSummarySection,
  buildOpenIssuesSection,
  buildOpsSection,
  buildRecommendationsSection,
  buildRevenueSection
} from "./reportSections";

export type DailyGroupReport = {
  snapshotId: string;
  snapshotDate: string;
  issueCount: number;
  criticalIssueCount: number;
  slackText: string;
};

export function buildDailyGroupReport(
  snapshot: PersistedDailySnapshot,
  findings: CriticalIssueFinding[]
): DailyGroupReport {
  const sections = [
    `*LifeShack Daily Report - ${snapshot.snapshotDate}*`,
    buildExecutiveSummarySection(findings),
    buildOpenIssuesSection(findings),
    buildRevenueSection(snapshot),
    buildOpsSection(snapshot),
    buildAtsSection(snapshot),
    buildApplicationQualitySection(snapshot),
    buildRecommendationsSection(findings)
  ];

  return {
    snapshotId: snapshot.id,
    snapshotDate: snapshot.snapshotDate,
    issueCount: findings.length,
    criticalIssueCount: findings.filter((finding) => finding.severity === "critical").length,
    slackText: sections.join("\n\n")
  };
}
