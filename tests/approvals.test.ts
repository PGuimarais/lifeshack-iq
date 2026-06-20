import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  approveApproval,
  createApprovalRequest,
  getApproval,
  listPendingApprovals,
  rejectApproval
} from "../src/services/approvals";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("approvals service", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("approvals");
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("creates, approves, and rejects durable approval requests", () => {
    const approval = createApprovalRequest({
      actionType: "refund",
      actionPayload: { amountCents: 1000 },
      requestMessage: "Refund customer?",
      requestedFromSlackUserId: "U123"
    });
    const rejectMe = createApprovalRequest({
      actionType: "customer_email",
      requestMessage: "Email customer?",
      requestedFromSlackUserId: "U123"
    });

    expect(listPendingApprovals()).toHaveLength(2);

    const approved = approveApproval(approval.id, "U999");
    const rejected = rejectApproval(rejectMe.id, "U999");

    expect(approved.status).toBe("approved");
    expect(approved.approvedByPersonId).toBeTruthy();
    expect(rejected.status).toBe("rejected");
    expect(getApproval(approval.id).resolvedAt).toBeTruthy();
    expect(listPendingApprovals()).toHaveLength(0);
  });
});
