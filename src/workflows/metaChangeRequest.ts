import { listRecentMetaChangeRequests } from "../db/repositories";
import type { WorkflowContext, WorkflowResult } from "../services/workflowRegistry";

export async function runMetaChangeRequestWorkflow(
  context: WorkflowContext
): Promise<WorkflowResult> {
  const proposedRequests = listRecentMetaChangeRequests(25).filter(
    (request) => request.status === "proposed"
  );

  return {
    workflowType: "meta_change_request",
    status: "succeeded",
    summary: `Meta change processing placeholder found ${proposedRequests.length} proposed request(s).`,
    details: {
      source: context.source,
      proposedRequestIds: proposedRequests.map((request) => request.id)
    }
  };
}
