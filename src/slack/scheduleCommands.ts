import type { WorkflowJobType } from "../db/queue";
import {
  listWorkflowSchedules,
  parseDayOfWeek,
  setWorkflowScheduleEnabled,
  upsertWorkflowSchedule,
  type ScheduleCadence
} from "../services/workflowSchedules";
import { resolveWorkflowType } from "../services/workflowRegistry";

function splitCommandText(text: string | undefined): { action: string; rest: string } {
  const normalized = (text ?? "").trim();

  if (!normalized) {
    return { action: "", rest: "" };
  }

  const [action = "", ...rest] = normalized.split(/\s+/);
  return { action: action.toLowerCase(), rest: rest.join(" ").trim() };
}

function requireWorkflow(name: string): WorkflowJobType {
  const workflowType = resolveWorkflowType(name);

  if (!workflowType) {
    throw new Error(`Unknown workflow: ${name}`);
  }

  return workflowType;
}

export function formatScheduleList(): string {
  const schedules = listWorkflowSchedules();

  return [
    "*Workflow Schedules*",
    "",
    ...schedules.map((schedule) => {
      const cadence =
        schedule.cadence === "interval"
          ? `every ${schedule.intervalMs}ms`
          : schedule.cadence === "weekly"
            ? `weekly day=${schedule.dayOfWeek} at ${schedule.timeOfDay} ${schedule.timezone}`
            : `daily at ${schedule.timeOfDay} ${schedule.timezone}`;
      return `- ${schedule.workflowType}: ${schedule.enabled ? "enabled" : "disabled"}, ${cadence}, next=${schedule.nextRunAt ?? "unset"}`;
    })
  ].join("\n");
}

export function handleScheduleCommand(text: string, actorSlackUserId: string): string {
  const { action, rest } = splitCommandText(text);

  if (!action || action === "list") {
    return formatScheduleList();
  }

  if (action === "enable" || action === "disable") {
    const workflowType = requireWorkflow(rest.trim());
    setWorkflowScheduleEnabled(workflowType, action === "enable", actorSlackUserId);
    return `${action === "enable" ? "Enabled" : "Disabled"} schedule for ${workflowType}.`;
  }

  if (action === "set") {
    const [workflowName, cadenceRaw, ...args] = rest.split(/\s+/).filter(Boolean);
    const workflowType = requireWorkflow(workflowName ?? "");
    const cadence = cadenceRaw as ScheduleCadence;

    if (cadence === "daily") {
      const [timeOfDay, timezone = "America/New_York"] = args;

      if (!timeOfDay) {
        return "Usage: /iq schedule set <workflow> daily <HH:mm> [timezone]";
      }

      const schedule = upsertWorkflowSchedule(
        {
          workflowType,
          cadence,
          timeOfDay,
          timezone,
          productionWorkflow: ["daily_critical_scan", "daily_group_report", "weekly_reflection", "teammate_checkin"].includes(workflowType),
          payload: { scheduled: true, source: "scheduler", useAgent: workflowType !== "teammate_checkin" }
        },
        actorSlackUserId
      );
      return `Updated ${workflowType} schedule. Next run: ${schedule?.nextRunAt ?? "unset"}.`;
    }

    if (cadence === "weekly") {
      const [day, timeOfDay, timezone = "America/New_York"] = args;

      if (!day || !timeOfDay) {
        return "Usage: /iq schedule set <workflow> weekly <day> <HH:mm> [timezone]";
      }

      const schedule = upsertWorkflowSchedule(
        {
          workflowType,
          cadence,
          dayOfWeek: parseDayOfWeek(day),
          timeOfDay,
          timezone,
          productionWorkflow: true,
          payload: { scheduled: true, source: "scheduler", useAgent: true }
        },
        actorSlackUserId
      );
      return `Updated ${workflowType} schedule. Next run: ${schedule?.nextRunAt ?? "unset"}.`;
    }

    if (cadence === "interval") {
      const intervalMs = Number(args[0]);

      if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        return "Usage: /iq schedule set <workflow> interval <milliseconds>";
      }

      const schedule = upsertWorkflowSchedule(
        {
          workflowType,
          cadence,
          intervalMs,
          productionWorkflow: false,
          payload: { scheduled: true, source: "scheduler" }
        },
        actorSlackUserId
      );
      return `Updated ${workflowType} schedule. Next run: ${schedule?.nextRunAt ?? "unset"}.`;
    }

    return "Usage: /iq schedule set <workflow> daily|weekly|interval ...";
  }

  return [
    "Usage:",
    "/iq schedule",
    "/iq schedule enable <workflow>",
    "/iq schedule disable <workflow>",
    "/iq schedule set <workflow> daily <HH:mm> [timezone]",
    "/iq schedule set <workflow> weekly <day> <HH:mm> [timezone]",
    "/iq schedule set <workflow> interval <milliseconds>"
  ].join("\n");
}
