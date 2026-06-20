import { sendDueTeammateCheckins } from "../services/checkins";
import type { WorkflowContext, WorkflowResult } from "../services/workflowRegistry";

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function runTeammateCheckinWorkflow(
  context: WorkflowContext
): Promise<WorkflowResult> {
  const payload = payloadRecord(context.payload);
  const sent = await sendDueTeammateCheckins({
    jobId: context.job?.id,
    personId: typeof payload.personId === "string" ? payload.personId : undefined,
    scheduled: payload.scheduled === true
  });
  const sentCount = sent.filter((checkin) => checkin.status === "pending").length;
  const notSentCount = sent.filter((checkin) => checkin.status !== "pending").length;

  return {
    workflowType: "teammate_checkin",
    status: "succeeded",
    summary: `Teammate check-in workflow sent ${sentCount} Slack DM(s)${
      notSentCount ? ` and recorded ${notSentCount} unsent local check-in(s)` : ""
    }.`,
    details: {
      sent
    }
  };
}
