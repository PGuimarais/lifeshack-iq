import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assignGoalOwner,
  assignInitiativeOwner,
  createGoal,
  createInitiative,
  createOrUpdateTeammate,
  listGoals,
  listInitiatives,
  listTeammates
} from "../src/services/operatingModel";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("operating model", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("operating-model");
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("creates teammates, goals, initiatives, and ownership", () => {
    const teammate = createOrUpdateTeammate({
      name: "Manik",
      slackUserId: "U123",
      role: "Operations",
      strengths: ["systems"],
      checkinSchedule: {
        enabled: true,
        cadence: "daily",
        timeOfDay: "08:00",
        timezone: "America/New_York"
      }
    });
    const goal = createGoal({
      name: "Improve activation",
      status: "proposed",
      ownerSlackUserId: "U123"
    });
    const initiative = createInitiative({
      goalId: goal.id,
      name: "Tighten onboarding",
      ownerSlackUserId: "U123"
    });

    expect(listTeammates()[0]?.strengths).toEqual(["systems"]);
    expect(listGoals()[0]?.ownerPersonId).toBe(teammate.id);
    expect(listInitiatives()[0]?.goalId).toBe(goal.id);

    const reassignedGoal = assignGoalOwner(goal.id, "U123");
    const reassignedInitiative = assignInitiativeOwner(initiative.id, "U123");

    expect(reassignedGoal.ownerPersonId).toBe(teammate.id);
    expect(reassignedInitiative.ownerPersonId).toBe(teammate.id);
  });
});
