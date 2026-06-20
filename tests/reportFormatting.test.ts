import { describe, expect, it } from "vitest";
import { persistDailySnapshot } from "../src/data/snapshots/createDailySnapshot";
import { buildDailyGroupReport } from "../src/reports/dailyReport";
import { detectCriticalIssues } from "../src/rules/criticalIssues";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("report formatting", () => {
  it("formats a Slack-ready report from snapshot and findings", () => {
    const databasePath = configureTestDb("report-formatting");
    migrateTestDb();

    try {
      const snapshot = persistDailySnapshot({
        snapshotDate: "2026-06-20",
        ops: {
          applicationVolume: {
            submitted: 50,
            previousSubmitted: 120,
            successRate: 0.5,
            previousSuccessRate: 0.9
          },
          ats: [
            {
              name: "Greenhouse",
              status: "outage",
              successRate: 0.1,
              previousSuccessRate: 0.95,
              errorRate: 0.8
            }
          ],
          providerBalances: []
        },
        revenue: {
          grossRevenueCents: 100000,
          mrrCents: 200000,
          cancellations: 10,
          previousCancellations: 2,
          cancellationRate: 0.2
        },
        appVolume: {
          submitted: 50,
          previousSubmitted: 120,
          successRate: 0.5,
          previousSuccessRate: 0.9
        },
        ats: [
          {
            name: "Greenhouse",
            status: "outage",
            successRate: 0.1,
            previousSuccessRate: 0.95,
            errorRate: 0.8
          }
        ],
        customerQuality: {
          totalApplications: 50,
          lowQualityApplications: 20,
          missingResumeCount: 8,
          qualityScore: 0.6,
          previousQualityScore: 0.9
        },
        providerBalances: [],
        rawSources: {}
      });
      const findings = detectCriticalIssues(snapshot);
      const report = buildDailyGroupReport(snapshot, findings);

      expect(report.slackText).toContain("*LifeShack Daily Report - 2026-06-20*");
      expect(report.slackText).toContain("*Open Issues*");
      expect(report.slackText).toContain("[critical]");
      expect(report.criticalIssueCount).toBeGreaterThan(0);
    } finally {
      removeTestDb(databasePath);
    }
  });
});
