import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMetaChangeRequest,
  createPromptModuleIfMissing,
  listActiveMetaConfigs,
  listPromptModules,
  listRecentMetaChangeRequests,
  upsertMetaConfig
} from "../src/db/repositories";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("meta config repositories", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("meta-config");
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("creates and lists meta change requests", () => {
    const created = createMetaChangeRequest({
      requestedBySlackUserId: "U123",
      requestText: "Daily reports should start with the top 3 risks.",
      riskLevel: "unknown"
    });

    const recent = listRecentMetaChangeRequests(5);

    expect(created.status).toBe("proposed");
    expect(recent[0]?.id).toBe(created.id);
    expect(recent[0]?.requestText).toBe("Daily reports should start with the top 3 risks.");
  });

  it("upserts and lists active meta config", () => {
    const result = upsertMetaConfig(
      "meta",
      "thresholds",
      { critical_issue_score: 90 },
      "U123",
      "test update"
    );
    const configs = listActiveMetaConfigs();
    const thresholds = configs.find((config) => config.key === "thresholds");

    expect(result.changed).toBe(true);
    expect(thresholds?.value).toEqual({ critical_issue_score: 90 });
  });

  it("seeds and lists prompt modules", () => {
    createPromptModuleIfMissing(
      "test_prompt",
      "A test prompt module.",
      "Keep the test concise and actionable."
    );

    const modules = listPromptModules();
    const seededModule = modules.find((module) => module.name === "base_operating_principles");
    const testModule = modules.find((module) => module.name === "test_prompt");

    expect(seededModule?.activeVersionNumber).toBe(1);
    expect(testModule?.activeVersionNumber).toBe(1);
  });
});
