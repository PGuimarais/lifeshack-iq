import { workflowAgentOutputSchema } from "../agents/schemas";
import { runAgent } from "../agents/runAgent";
import type { WorkflowContext, WorkflowResult } from "../services/workflowRegistry";

export async function runWeeklyReflectionWorkflow(
  context: WorkflowContext
): Promise<WorkflowResult> {
  const result = await runAgent({
    workflowType: "weekly_reflection",
    promptModuleName: "weekly_reflection_prompt",
    input: {
      payload: context.payload,
      source: context.source,
      note: "Placeholder workflow; no live weekly company data is connected yet."
    },
    outputSchema: workflowAgentOutputSchema
  });

  return {
    workflowType: "weekly_reflection",
    status: "succeeded",
    summary: result.output.summary,
    agentRunId: result.agentRunId,
    details: result.output
  };
}
