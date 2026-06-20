import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkflowResult } from "../src/services/workflowRegistry";
import {
  formatWorkflowNotification,
  getNotificationChannel
} from "../src/slack/notifier";

const originalDailyChannel = process.env.IQ_DAILY_UPDATE_CHANNEL_ID;
const originalCriticalChannel = process.env.IQ_CRITICAL_ALERT_CHANNEL_ID;
const originalWeeklyChannel = process.env.IQ_WEEKLY_REFLECTION_CHANNEL_ID;

function restoreEnv(): void {
  if (originalDailyChannel === undefined) {
    delete process.env.IQ_DAILY_UPDATE_CHANNEL_ID;
  } else {
    process.env.IQ_DAILY_UPDATE_CHANNEL_ID = originalDailyChannel;
  }

  if (originalCriticalChannel === undefined) {
    delete process.env.IQ_CRITICAL_ALERT_CHANNEL_ID;
  } else {
    process.env.IQ_CRITICAL_ALERT_CHANNEL_ID = originalCriticalChannel;
  }

  if (originalWeeklyChannel === undefined) {
    delete process.env.IQ_WEEKLY_REFLECTION_CHANNEL_ID;
  } else {
    process.env.IQ_WEEKLY_REFLECTION_CHANNEL_ID = originalWeeklyChannel;
  }
}

describe("Slack workflow notifier", () => {
  beforeEach(() => {
    delete process.env.IQ_DAILY_UPDATE_CHANNEL_ID;
    delete process.env.IQ_CRITICAL_ALERT_CHANNEL_ID;
    delete process.env.IQ_WEEKLY_REFLECTION_CHANNEL_ID;
  });

  afterEach(() => {
    restoreEnv();
  });

  it("routes daily reports to the daily update channel", () => {
    process.env.IQ_DAILY_UPDATE_CHANNEL_ID = "CDAILY";

    expect(getNotificationChannel("daily_group_report")).toBe("CDAILY");
  });

  it("routes critical scans to a critical channel with daily update fallback", () => {
    process.env.IQ_DAILY_UPDATE_CHANNEL_ID = "CDAILY";

    expect(getNotificationChannel("daily_critical_scan")).toBe("CDAILY");

    process.env.IQ_CRITICAL_ALERT_CHANNEL_ID = "CCRITICAL";

    expect(getNotificationChannel("daily_critical_scan")).toBe("CCRITICAL");
  });

  it("routes weekly reflections to a weekly channel with daily update fallback", () => {
    process.env.IQ_DAILY_UPDATE_CHANNEL_ID = "CDAILY";

    expect(getNotificationChannel("weekly_reflection")).toBe("CDAILY");

    process.env.IQ_WEEKLY_REFLECTION_CHANNEL_ID = "CWEEKLY";

    expect(getNotificationChannel("weekly_reflection")).toBe("CWEEKLY");
  });

  it("formats workflow summaries for Slack posting", () => {
    const result: WorkflowResult = {
      workflowType: "daily_group_report",
      status: "succeeded",
      summary: "No critical issues found."
    };

    expect(formatWorkflowNotification(result)).toContain("*LifeShack IQ: Daily Group Report*");
    expect(formatWorkflowNotification(result)).toContain("No critical issues found.");
  });
});
