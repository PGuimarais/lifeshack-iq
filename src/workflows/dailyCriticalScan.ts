import { workflowAgentOutputSchema } from "../agents/schemas";
import { runAgent } from "../agents/runAgent";
import { createDailySnapshot } from "../data/snapshots/createDailySnapshot";
import { detectCriticalIssues } from "../rules/criticalIssues";
import { upsertIssuesForFindings } from "../rules/issueMatching";
import type { WorkflowContext, WorkflowResult } from "../services/workflowRegistry";
import { shouldUseAgent } from "./workflowOptions";

export async function runDailyCriticalScanWorkflow(
  context: WorkflowContext
): Promise<WorkflowResult> {
  const snapshot = await createDailySnapshot();
  const findings = detectCriticalIssues(snapshot);
  const issueResults = upsertIssuesForFindings(findings);
  const deterministicSummary =
    findings.length === 0
      ? "Critical scan completed. No deterministic critical issues found."
      : `Critical scan completed. Found ${findings.length} issue(s), including ${findings.filter((finding) => finding.severity === "critical").length} critical.`;
  const useAgent = shouldUseAgent(context);
  const agentResult = useAgent
    ? await runAgent({
        workflowType: "daily_critical_scan",
        promptModuleName: "daily_critical_scan_prompt",
        input: {
          snapshot,
          findings,
          issueIds: issueResults.map((result) => result.issue.id),
          requestedFormat: "Slack-ready synthesis"
        },
        outputSchema: workflowAgentOutputSchema
      })
    : null;

  return {
    workflowType: "daily_critical_scan",
    status: "succeeded",
    summary: agentResult?.output.summary ?? deterministicSummary,
    agentRunId: agentResult?.agentRunId,
    details: {
      snapshotId: snapshot.id,
      snapshotDate: snapshot.snapshotDate,
      usedAgent: useAgent,
      findings,
      issues: issueResults.map((result) => ({
        id: result.issue.id,
        title: result.issue.title,
        severity: result.issue.severity,
        created: result.created,
        actions: [
          "issue_create_task",
          "issue_assign_self",
          "issue_snooze",
          "issue_resolve"
        ]
      })),
      agentOutput: agentResult?.output
    }
  };
}
