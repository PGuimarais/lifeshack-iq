import { workflowAgentOutputSchema } from "../agents/schemas";
import { runAgent } from "../agents/runAgent";
import { buildOperatingContext } from "../services/operatingContext";
import type { WorkflowContext, WorkflowResult } from "../services/workflowRegistry";

export async function runWeeklyReflectionWorkflow(
  context: WorkflowContext
): Promise<WorkflowResult> {
  const operatingContext = await buildOperatingContext({
    createFreshSnapshot: true,
    snapshotLimit: 7,
    recentLimit: 75
  });
  const result = await runAgent({
    workflowType: "weekly_reflection",
    promptModuleName: "weekly_reflection_prompt",
    input: {
      payload: context.payload,
      source: context.source,
      operatingContext,
      requestedAnalysis: [
        "Synthesize company data, Slack/check-in context, Granola meeting context, goals, initiatives, tasks, issues, and outcomes.",
        "Identify strategy/process changes, opportunities, emerging issues, and where current efforts are working or not working.",
        "Use safe internal tools for concrete follow-up tasks, context notes, proposed goals, goal updates, initiatives, and approval requests when evidence supports them.",
        "Classify active strategies as WORKING, NOT_WORKING, or NOT_ENOUGH_DATA."
      ]
    },
    outputSchema: workflowAgentOutputSchema
  });

  return {
    workflowType: "weekly_reflection",
    status: "succeeded",
    summary: result.output.summary,
    agentRunId: result.agentRunId,
    details: {
      snapshotId: operatingContext.currentSnapshot?.id,
      snapshotDate: operatingContext.currentSnapshot?.snapshotDate,
      inputCounts: {
        snapshots: operatingContext.recentSnapshots.length,
        teammates: operatingContext.teammates.length,
        goals: operatingContext.goals.length,
        initiatives: operatingContext.initiatives.length,
        openTasks: operatingContext.tasks.open.length,
        recentlyClosedTasks: operatingContext.tasks.recentlyClosed.length,
        issues: operatingContext.issues.length,
        checkins: operatingContext.checkins.length,
        granolaTranscripts: operatingContext.granolaTranscripts.length,
        contextEntries: operatingContext.contextEntries.length
      },
      agentOutput: result.output,
      toolCalls: result.toolCalls
    }
  };
}
