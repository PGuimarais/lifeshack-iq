import { executeApprovedAction } from "../services/actionExecutor";
import type { WorkflowContext, WorkflowResult } from "../services/workflowRegistry";

function getApprovalId(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "approvalId" in payload &&
    typeof payload.approvalId === "string"
  ) {
    return payload.approvalId;
  }

  throw new Error("approval_action workflow requires payload.approvalId.");
}

export async function runApprovalActionWorkflow(
  context: WorkflowContext
): Promise<WorkflowResult> {
  const approvalId = getApprovalId(context.payload);
  const result = executeApprovedAction(approvalId);

  return {
    workflowType: "approval_action",
    status: "succeeded",
    summary: result.message,
    details: result
  };
}
