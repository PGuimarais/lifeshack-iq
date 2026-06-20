import type { PersistedDailySnapshot } from "../data/snapshots/createDailySnapshot";
import type { CriticalIssueFinding } from "../rules/types";
import { bullet, formatCurrency, formatPercent, section, severityIcon } from "./slackFormatting";

export function buildExecutiveSummarySection(
  findings: CriticalIssueFinding[]
): string {
  const criticalCount = findings.filter((finding) => finding.severity === "critical").length;
  const mediumCount = findings.filter((finding) => finding.severity === "medium").length;

  return section("Executive Summary", [
    bullet(`${criticalCount} critical issue(s), ${mediumCount} watch item(s).`),
    bullet(
      findings.length > 0
        ? `Top risk: ${findings[0]?.title}.`
        : "No deterministic critical issues detected in the latest snapshot."
    )
  ]);
}

export function buildRevenueSection(snapshot: PersistedDailySnapshot): string {
  const revenue = snapshot.revenue;

  return section("Revenue And Subscriptions", [
    bullet(`Gross revenue: ${formatCurrency(revenue.grossRevenueCents)}`),
    bullet(`MRR: ${formatCurrency(revenue.mrrCents)}`),
    bullet(`New subscriptions: ${revenue.newSubscriptions ?? "unknown"}`),
    bullet(`Cancellations: ${revenue.cancellations ?? "unknown"}`),
    bullet(`Cancellation rate: ${formatPercent(revenue.cancellationRate)}`)
  ]);
}

export function buildOpsSection(snapshot: PersistedDailySnapshot): string {
  return section("Operations", [
    bullet(`Applications submitted: ${snapshot.appVolume.submitted}`),
    bullet(`Previous submitted: ${snapshot.appVolume.previousSubmitted ?? "unknown"}`),
    bullet(`Overall success rate: ${formatPercent(snapshot.appVolume.successRate)}`)
  ]);
}

export function buildAtsSection(snapshot: PersistedDailySnapshot): string {
  return section(
    "ATS Health",
    snapshot.ats.map((ats) =>
      bullet(
        `${ats.name}: ${ats.status}, success ${formatPercent(ats.successRate)}, errors ${formatPercent(ats.errorRate)}`
      )
    )
  );
}

export function buildApplicationQualitySection(snapshot: PersistedDailySnapshot): string {
  const quality = snapshot.customerQuality;

  return section("Application Quality", [
    bullet(`Total applications: ${quality.totalApplications ?? snapshot.appVolume.submitted}`),
    bullet(`Low quality applications: ${quality.lowQualityApplications ?? "unknown"}`),
    bullet(`Missing resumes: ${quality.missingResumeCount ?? "unknown"}`),
    bullet(`Quality score: ${formatPercent(quality.qualityScore)}`)
  ]);
}

export function buildOpenIssuesSection(findings: CriticalIssueFinding[]): string {
  return section(
    "Open Issues",
    findings.map((finding) =>
      bullet(`${severityIcon(finding.severity)} ${finding.title}: ${finding.description}`)
    )
  );
}

export function buildRecommendationsSection(findings: CriticalIssueFinding[]): string {
  const recommendations = findings.map((finding) => finding.recommendation);
  const uniqueRecommendations = [...new Set(recommendations)];

  return section(
    "Recommended Actions",
    uniqueRecommendations.map((recommendation) => bullet(recommendation))
  );
}
