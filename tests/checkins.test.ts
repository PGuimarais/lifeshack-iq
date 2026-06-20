import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { createId, nowIso } from "../src/db/repositories";
import { checkins } from "../src/db/schema";
import {
  listDueCheckinTeammates,
  recordCheckinReply,
  sendTeammateCheckin
} from "../src/services/checkins";
import { createOrUpdateTeammate } from "../src/services/operatingModel";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("teammate check-ins", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("checkins");
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("records a local check-in when Slack is not configured", async () => {
    const teammate = createOrUpdateTeammate({
      name: "Jessica",
      slackUserId: "U456"
    });

    const checkin = await sendTeammateCheckin({ personId: teammate.id });

    expect(checkin.status).toBe("not_sent");
    expect(checkin.promptText).toContain("Jessica");
  });

  it("finds due teammates based on configured check-in schedules", () => {
    const teammate = createOrUpdateTeammate({
      name: "Manik",
      slackUserId: "U123",
      checkinSchedule: {
        enabled: true,
        cadence: "daily",
        timeOfDay: "08:00",
        timezone: "UTC"
      }
    });

    const due = listDueCheckinTeammates(new Date("2026-01-01T08:01:00.000Z"));

    expect(due.map((person) => person.id)).toContain(teammate.id);
  });

  it("records Slack DM replies against the latest pending check-in", () => {
    const teammate = createOrUpdateTeammate({
      name: "Manik",
      slackUserId: "U123"
    });
    const timestamp = nowIso();
    getDb()
      .insert(checkins)
      .values({
        id: createId("checkin"),
        personId: teammate.id,
        jobId: null,
        channelId: "D123",
        messageTs: "1.0",
        status: "pending",
        promptText: "Check in?",
        responseText: null,
        responseTs: null,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .run();

    const recorded = recordCheckinReply({
      slackUserId: "U123",
      channelId: "D123",
      text: "I shipped the dashboard and I am blocked on Stripe data.",
      ts: "2.0"
    });

    expect(recorded?.status).toBe("responded");
    expect(recorded?.responseText).toContain("blocked on Stripe");
  });
});
