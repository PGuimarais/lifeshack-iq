import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { issues } from "../src/db/schema";
import { getManualDataConnectors } from "../src/data/connectors";
import { createDailySnapshot } from "../src/data/snapshots/createDailySnapshot";
import { detectCriticalIssues } from "../src/rules/criticalIssues";
import { upsertIssuesForFindings } from "../src/rules/issueMatching";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("critical issue rules", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("critical-issues");
    process.env.IQ_DATA_PROFILE = "critical";
    migrateTestDb();
  });

  afterEach(() => {
    delete process.env.IQ_DATA_PROFILE;
    removeTestDb(databasePath);
  });

  it("only detects obvious hard failures deterministically and upserts issue records", async () => {
    const snapshot = await createDailySnapshot({
      connectors: getManualDataConnectors()
    });
    const findings = detectCriticalIssues(snapshot);
    const upserts = upsertIssuesForFindings(findings);
    const secondPass = upsertIssuesForFindings(findings);
    const rows = getDb().select().from(issues).all();

    expect(findings.some((finding) => finding.ruleId === "ats_obvious_failure")).toBe(true);
    expect(findings.some((finding) => finding.ruleId === "provider_obvious_failure")).toBe(true);
    expect(findings.some((finding) => finding.ruleId === "application_volume_drop")).toBe(false);
    expect(findings.some((finding) => finding.ruleId === "cancellation_spike")).toBe(false);
    expect(findings.some((finding) => finding.ruleId === "application_quality_low")).toBe(false);
    expect(findings.some((finding) => finding.ruleId === "provider_balance_low")).toBe(false);
    expect(upserts.length).toBe(findings.length);
    expect(secondPass.every((result) => result.created === false)).toBe(true);
    expect(rows).toHaveLength(findings.length);
  });
});
