import { createConfigEvent, jsonParseSafe } from "../db/repositories";
import { getApproval } from "./approvals";

export const sensitiveActionTypes = [
  "refund",
  "customer_email",
  "codex_task",
  "aws_change",
  "production_change"
] as const;

export type SensitiveActionType = (typeof sensitiveActionTypes)[number];

export type ActionExecutionResult = {
  executed: true;
  mode: "stub";
  actionType: string;
  approvalId: string;
  message: string;
  payload: unknown;
};

export function isSensitiveActionType(actionType: string): actionType is SensitiveActionType {
  return sensitiveActionTypes.includes(actionType as SensitiveActionType);
}

function stubMessage(actionType: string): string {
  switch (actionType) {
    case "refund":
      return "Refund action approved; stub handler recorded no real Stripe call.";
    case "customer_email":
      return "Customer email action approved; stub handler sent no email.";
    case "codex_task":
      return "Codex task action approved; stub handler did not hand off work.";
    case "aws_change":
      return "AWS change approved; stub handler made no AWS write.";
    case "production_change":
      return "Production change approved; stub handler made no production change.";
    default:
      return `${actionType} approved; stub handler executed no real side effect.`;
  }
}

export function executeSensitiveAction(input: {
  actionType: string;
  payload?: unknown;
  approvalId?: string;
}): ActionExecutionResult {
  if (!isSensitiveActionType(input.actionType)) {
    throw new Error(`Unsupported sensitive action type: ${input.actionType}`);
  }

  if (!input.approvalId) {
    throw new Error("Sensitive action execution requires an approved approval id.");
  }

  const approval = getApproval(input.approvalId);

  if (approval.actionType !== input.actionType) {
    throw new Error(
      `Approval ${approval.id} is for ${approval.actionType}, not ${input.actionType}.`
    );
  }

  if (approval.status !== "approved") {
    throw new Error(`Approval ${approval.id} is not approved.`);
  }

  const payload = input.payload ?? jsonParseSafe(approval.actionPayloadJson, null);
  const result: ActionExecutionResult = {
    executed: true,
    mode: "stub",
    actionType: input.actionType,
    approvalId: approval.id,
    message: stubMessage(input.actionType),
    payload
  };

  createConfigEvent({
    eventType: "sensitive_action_stub_executed",
    targetType: "approval",
    targetId: approval.id,
    after: result
  });
  return result;
}

export function executeApprovedAction(approvalId: string): ActionExecutionResult {
  const approval = getApproval(approvalId);
  return executeSensitiveAction({
    actionType: approval.actionType,
    approvalId,
    payload: jsonParseSafe(approval.actionPayloadJson, null)
  });
}
