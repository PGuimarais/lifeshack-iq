import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  createConfigEvent,
  createId,
  jsonParseSafe,
  jsonStringifySafe,
  nowIso
} from "../db/repositories";
import { approvals } from "../db/schema";
import { getOrCreatePersonForSlackUser } from "./slackLinks";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "cancelled";

export type ApprovalRequestInput = {
  actionType: string;
  actionPayload?: unknown;
  requestMessage?: string;
  requestedFromSlackUserId?: string;
  proposedByRunId?: string;
};

export function createApprovalRequest(input: ApprovalRequestInput) {
  const requestedFrom = input.requestedFromSlackUserId
    ? getOrCreatePersonForSlackUser(input.requestedFromSlackUserId)
    : null;
  const timestamp = nowIso();
  const row = {
    id: createId("approval"),
    actionType: input.actionType,
    proposedByRunId: input.proposedByRunId ?? null,
    status: "pending",
    requestedFromPersonId: requestedFrom?.id ?? null,
    approvedByPersonId: null,
    requestMessage: input.requestMessage ?? `Approve ${input.actionType}?`,
    actionPayloadJson:
      input.actionPayload === undefined ? null : jsonStringifySafe(input.actionPayload),
    createdAt: timestamp,
    resolvedAt: null
  };

  getDb().insert(approvals).values(row).run();
  createConfigEvent({
    eventType: "approval_requested",
    actorSlackUserId: input.requestedFromSlackUserId,
    targetType: "approval",
    targetId: row.id,
    after: {
      actionType: input.actionType,
      status: "pending"
    }
  });
  return row;
}

export function listPendingApprovals(limit = 20) {
  return getDb()
    .select()
    .from(approvals)
    .where(eq(approvals.status, "pending"))
    .orderBy(asc(approvals.createdAt))
    .limit(limit)
    .all();
}

export function listApprovals(statuses: ApprovalStatus[] = ["pending"], limit = 20) {
  return getDb()
    .select()
    .from(approvals)
    .where(inArray(approvals.status, statuses))
    .orderBy(asc(approvals.createdAt))
    .limit(limit)
    .all();
}

export function getApproval(approvalId: string) {
  const approval = getDb()
    .select()
    .from(approvals)
    .where(eq(approvals.id, approvalId))
    .limit(1)
    .get();

  if (!approval) {
    throw new Error(`Approval not found: ${approvalId}`);
  }

  return approval;
}

export function getApprovalPayload<T>(approvalId: string, fallback: T): T {
  return jsonParseSafe(getApproval(approvalId).actionPayloadJson, fallback);
}

export function approveApproval(approvalId: string, slackUserId: string) {
  const approval = getApproval(approvalId);

  if (approval.status !== "pending") {
    throw new Error(`Approval is not pending: ${approvalId}`);
  }

  const approvedBy = getOrCreatePersonForSlackUser(slackUserId);
  const resolvedAt = nowIso();
  getDb()
    .update(approvals)
    .set({
      status: "approved",
      approvedByPersonId: approvedBy.id,
      resolvedAt
    })
    .where(eq(approvals.id, approvalId))
    .run();
  createConfigEvent({
    eventType: "approval_approved",
    actorSlackUserId: slackUserId,
    targetType: "approval",
    targetId: approvalId,
    after: {
      status: "approved"
    }
  });
  return getApproval(approvalId);
}

export function rejectApproval(approvalId: string, slackUserId: string) {
  const approval = getApproval(approvalId);

  if (approval.status !== "pending") {
    throw new Error(`Approval is not pending: ${approvalId}`);
  }

  const rejectedBy = getOrCreatePersonForSlackUser(slackUserId);
  const resolvedAt = nowIso();
  getDb()
    .update(approvals)
    .set({
      status: "rejected",
      approvedByPersonId: rejectedBy.id,
      resolvedAt
    })
    .where(eq(approvals.id, approvalId))
    .run();
  createConfigEvent({
    eventType: "approval_rejected",
    actorSlackUserId: slackUserId,
    targetType: "approval",
    targetId: approvalId,
    after: {
      status: "rejected"
    }
  });
  return getApproval(approvalId);
}
