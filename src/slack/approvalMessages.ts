import type { KnownBlock } from "@slack/types";
import type { approvals } from "../db/schema";
import { getApproval, listPendingApprovals } from "../services/approvals";

export function formatApprovalList() {
  const approvals = listPendingApprovals(20);

  if (approvals.length === 0) {
    return "No pending approvals.";
  }

  return [
    "*Pending Approvals*",
    "",
    ...approvals.map(
      (approval) =>
        `- ${approval.id} ${approval.actionType}: ${approval.requestMessage ?? "No message"}`
    )
  ].join("\n");
}

export function formatApprovalDetails(approvalId: string) {
  const approval = getApproval(approvalId);

  return [
    `*Approval ${approval.id}*`,
    "",
    `Action: ${approval.actionType}`,
    `Status: ${approval.status}`,
    `Requested from: ${approval.requestedFromPersonId ?? "any approver"}`,
    `Approved by: ${approval.approvedByPersonId ?? "none"}`,
    `Created: ${approval.createdAt}`,
    `Resolved: ${approval.resolvedAt ?? "not resolved"}`,
    "",
    approval.requestMessage ?? "No message."
  ].join("\n");
}

export function buildApprovalRequestBlocks(
  approval: typeof approvals.$inferSelect
): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Approval requested*\n${approval.requestMessage ?? approval.actionType}\nApproval: ${approval.id}`
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Approve"
          },
          style: "primary",
          action_id: "approval_approve",
          value: approval.id
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Reject"
          },
          style: "danger",
          action_id: "approval_reject",
          value: approval.id
        }
      ]
    }
  ];
}
