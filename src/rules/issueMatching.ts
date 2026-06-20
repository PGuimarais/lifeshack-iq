import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  createId,
  jsonParseSafe,
  jsonStringifySafe,
  nowIso
} from "../db/repositories";
import { issues } from "../db/schema";
import type { CriticalIssueFinding } from "./types";

export type IssueUpsertResult = {
  finding: CriticalIssueFinding;
  issue: typeof issues.$inferSelect;
  created: boolean;
};

function getIssueKey(issue: typeof issues.$inferSelect): string | null {
  const evidence = jsonParseSafe<Record<string, unknown>>(issue.evidenceJson, {});
  return typeof evidence.issueKey === "string" ? evidence.issueKey : null;
}

export function upsertIssuesForFindings(
  findings: CriticalIssueFinding[]
): IssueUpsertResult[] {
  if (findings.length === 0) {
    return [];
  }

  const db = getDb();
  const openIssues = db
    .select()
    .from(issues)
    .where(inArray(issues.status, ["open", "will_handle_later"]))
    .all();
  const issueByKey = new Map(
    openIssues
      .map((issue) => [getIssueKey(issue), issue] as const)
      .filter((entry): entry is [string, typeof issues.$inferSelect] => Boolean(entry[0]))
  );

  return findings.map((finding) => {
    const existing = issueByKey.get(finding.issueKey);
    const timestamp = nowIso();
    const evidenceJson = jsonStringifySafe({
      ...finding.evidence,
      ruleId: finding.ruleId,
      issueKey: finding.issueKey,
      recommendation: finding.recommendation
    });

    if (existing) {
      db.update(issues)
        .set({
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          area: finding.area,
          status: "open",
          lastSeenAt: timestamp,
          evidenceJson,
          updatedAt: timestamp
        })
        .where(and(eq(issues.id, existing.id), eq(issues.status, existing.status)))
        .run();

      const updated = db.select().from(issues).where(eq(issues.id, existing.id)).limit(1).get();

      if (!updated) {
        throw new Error(`Updated issue disappeared: ${existing.id}`);
      }

      return {
        finding,
        issue: updated,
        created: false
      };
    }

    const row = {
      id: createId("issue"),
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      area: finding.area,
      status: "open",
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      snoozedUntil: null,
      ownerPersonId: null,
      evidenceJson,
      notes: finding.recommendation,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    db.insert(issues).values(row).run();

    return {
      finding,
      issue: row,
      created: true
    };
  });
}
