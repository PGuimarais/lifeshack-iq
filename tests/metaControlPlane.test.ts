import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyMetaChangeRequest,
  cancelMetaChangeRequest,
  getMetaHistory,
  learnMetaInstruction,
  listMetaConfigVersions,
  rollbackMetaTarget,
  setMetaTarget,
  showMetaControlPlane
} from "../src/services/metaConfig";
import { getActivePromptModule } from "../src/services/promptModules";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("meta control plane", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("meta-control-plane");
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("shows seeded active config and prompt modules", () => {
    const summary = showMetaControlPlane();

    expect(summary.configs.some((config) => config.key === "report_style")).toBe(true);
    expect(
      summary.promptModules.some((prompt) => prompt.name === "base_operating_principles")
    ).toBe(true);
  });

  it("learns, applies, and cancels meta change requests", () => {
    const applyRequest = learnMetaInstruction("Make reports terser.", "U123");
    const cancelRequest = learnMetaInstruction("Ignore this one.", "U123");

    const applied = applyMetaChangeRequest(applyRequest.id, "U999");
    const cancelled = cancelMetaChangeRequest(cancelRequest.id, "U999");

    expect(applied.status).toBe("applied");
    expect(applied.approvedBySlackUserId).toBe("U999");
    expect(cancelled.status).toBe("cancelled");
  });

  it("versions config changes, supports rollback, and records history", () => {
    setMetaTarget("meta.thresholds", "{\"critical_issue_score\":90}", "U123");
    setMetaTarget("meta.thresholds", "{\"critical_issue_score\":95}", "U123");

    const versions = listMetaConfigVersions("meta", "thresholds");
    const rollback = rollbackMetaTarget("meta.thresholds", 1, "U123");
    const history = getMetaHistory(20);

    expect(versions).toHaveLength(2);
    expect(rollback.kind).toBe("config");
    expect(rollback.version.versionNumber).toBe(1);
    expect(history.events.some((event) => event.eventType === "meta_config_rolled_back")).toBe(true);
  });

  it("versions prompt modules and rolls them back", () => {
    const before = getActivePromptModule("daily_group_report_prompt");
    setMetaTarget("prompt.daily_group_report_prompt", "Prompt version two.", "U123");
    const updated = getActivePromptModule("daily_group_report_prompt");

    rollbackMetaTarget("prompt.daily_group_report_prompt", before.versionNumber, "U123");
    const rolledBack = getActivePromptModule("daily_group_report_prompt");

    expect(updated.versionNumber).toBe(before.versionNumber + 1);
    expect(rolledBack.versionNumber).toBe(before.versionNumber);
  });

  it("enforces hardcoded safety invariants", () => {
    expect(() =>
      setMetaTarget("meta.safety", "{\"refunds_require_approval\":false}", "U123")
    ).toThrow(/Safety invariant violation/);
    expect(() =>
      setMetaTarget("meta.workflow", "{\"runtime\":\"cloud\"}", "U123")
    ).toThrow(/Safety invariant violation/);
  });
});
