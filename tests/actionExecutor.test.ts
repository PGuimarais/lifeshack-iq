import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeApprovedAction, executeSensitiveAction } from "../src/services/actionExecutor";
import { approveApproval, createApprovalRequest } from "../src/services/approvals";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("action executor", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("action-executor");
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("prevents sensitive actions without approval and executes stubs after approval", () => {
    const approval = createApprovalRequest({
      actionType: "refund",
      actionPayload: { amountCents: 2500 },
      requestMessage: "Refund?"
    });

    expect(() => executeSensitiveAction({ actionType: "refund" })).toThrow(/approved approval id/);
    expect(() =>
      executeSensitiveAction({ actionType: "refund", approvalId: approval.id })
    ).toThrow(/not approved/);

    approveApproval(approval.id, "U123");
    const result = executeApprovedAction(approval.id);

    expect(result.mode).toBe("stub");
    expect(result.message).toContain("no real Stripe call");
  });
});
