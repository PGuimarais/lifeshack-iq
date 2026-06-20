import type { PersistedDailySnapshot } from "../data/snapshots/createDailySnapshot";

export type CriticalIssueSeverity = "low" | "medium" | "critical";

export type CriticalIssueFinding = {
  ruleId: string;
  issueKey: string;
  title: string;
  description: string;
  severity: CriticalIssueSeverity;
  area: string;
  evidence: Record<string, unknown>;
  recommendation: string;
};

export type CriticalIssueRule = (
  snapshot: PersistedDailySnapshot
) => CriticalIssueFinding[];

export function pct(value: number | undefined): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "unknown";
}
