import { workflowAgentOutputSchema } from "../agents/schemas";
import { runAgent } from "../agents/runAgent";
import { createDailySnapshot } from "../data/snapshots/createDailySnapshot";
import { buildDailyGroupReport } from "../reports/dailyReport";
import { detectCriticalIssues } from "../rules/criticalIssues";
import { upsertIssuesForFindings } from "../rules/issueMatching";
import type { WorkflowContext, WorkflowResult } from "../services/workflowRegistry";
import { shouldUseAgent } from "./workflowOptions";

export async function runDailyGroupReportWorkflow(
  context: WorkflowContext
): Promise<WorkflowResult> {
  const snapshot = await createDailySnapshot();
  const findings = detectCriticalIssues(snapshot);
  const issueResults = upsertIssuesForFindings(findings);
  const report = buildDailyGroupReport(snapshot, findings);
  const useAgent = shouldUseAgent(context);
  const agentResult = useAgent
    ? await runAgent({
        workflowType: "daily_group_report",
        promptModuleName: "daily_group_report_prompt",
        input: {
          snapshot,
          findings,
          issueIds: issueResults.map((result) => result.issue.id),
          deterministicReport: report.slackText,
          requestedFormat: "Slack-ready executive daily report"
        },
        outputSchema: workflowAgentOutputSchema
      })
    : null;

  return {
    workflowType: "daily_group_report",
    status: "succeeded",
    summary: agentResult?.output.summary ?? report.slackText,
    agentRunId: agentResult?.agentRunId,
    details: {
      snapshotId: snapshot.id,
      snapshotDate: snapshot.snapshotDate,
      usedAgent: useAgent,
      report,
      findings,
      issues: issueResults.map((result) => ({
        id: result.issue.id,
        title: result.issue.title,
        severity: result.issue.severity,
        created: result.created
      })),
      agentOutput: agentResult?.output
    }
  };
}
