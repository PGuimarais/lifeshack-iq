import {
  assignGoalOwner,
  assignInitiativeOwner,
  createGoal,
  createInitiative,
  createOrUpdateTeammate,
  getPersonForSlackUser,
  listGoals,
  listInitiatives,
  listTeammates,
  type CheckinScheduleConfig
} from "../services/operatingModel";
import { parseDayOfWeek } from "../services/workflowSchedules";

function splitCommandText(text: string | undefined): { action: string; rest: string } {
  const normalized = (text ?? "").trim();

  if (!normalized) {
    return { action: "", rest: "" };
  }

  const [action = "", ...rest] = normalized.split(/\s+/);
  return { action: action.toLowerCase(), rest: rest.join(" ").trim() };
}

function normalizeSlackUserId(value: string): string {
  return value.match(/^<@([^>|]+)(?:\|[^>]+)?>$/)?.[1] ?? value;
}

function firstToken(text: string): { token: string; rest: string } {
  const [token = "", ...rest] = text.trim().split(/\s+/);
  return { token, rest: rest.join(" ").trim() };
}

function formatPersonId(ownerPersonId: string | null | undefined): string {
  return ownerPersonId ?? "unowned";
}

export function formatTeammateList(): string {
  const teammates = listTeammates();

  return [
    "*Teammates*",
    "",
    ...(teammates.length
      ? teammates.map((person) => {
          const slack = person.slackUserId ? ` <@${person.slackUserId}>` : "";
          const schedule = person.checkinSchedule?.enabled
            ? `, check-in ${person.checkinSchedule.cadence} ${person.checkinSchedule.timeOfDay} ${person.checkinSchedule.timezone}`
            : "";
          return `- ${person.name}${slack}${person.role ? `, ${person.role}` : ""}${schedule}`;
        })
      : ["- No teammates configured"])
  ].join("\n");
}

export function handleTeammateCommand(text: string, actorSlackUserId: string): string {
  const { action, rest } = splitCommandText(text);

  if (!action || action === "list") {
    return formatTeammateList();
  }

  if (action === "add") {
    const { token, rest: name } = firstToken(rest);

    if (!token || !name) {
      return "Usage: /iq teammate add <@slack_user> <name>";
    }

    const teammate = createOrUpdateTeammate(
      {
        slackUserId: normalizeSlackUserId(token),
        name
      },
      actorSlackUserId
    );
    return `Added teammate ${teammate.name} (${teammate.id}).`;
  }

  if (action === "schedule") {
    const parts = rest.split(/\s+/).filter(Boolean);
    const [slackToken, cadence, first, second, third] = parts;

    if (!slackToken || !cadence || !first || !second) {
      return "Usage: /iq teammate schedule <@slack_user> daily <HH:mm> <timezone> OR weekly <day> <HH:mm> <timezone>";
    }

    const slackUserId = normalizeSlackUserId(slackToken);
    const existing = getPersonForSlackUser(slackUserId);
    const schedule: CheckinScheduleConfig =
      cadence === "weekly"
        ? {
            enabled: true,
            cadence: "weekly",
            dayOfWeek: parseDayOfWeek(first),
            timeOfDay: second,
            timezone: third ?? "America/New_York"
          }
        : {
            enabled: true,
            cadence: "daily",
            timeOfDay: first,
            timezone: second
          };
    const teammate = createOrUpdateTeammate(
      {
        slackUserId,
        name: existing?.name ?? slackUserId,
        role: existing?.role ?? undefined,
        checkinSchedule: schedule
      },
      actorSlackUserId
    );

    return `Updated check-in schedule for ${teammate.name}.`;
  }

  return [
    "Usage:",
    "/iq teammates",
    "/iq teammate add <@slack_user> <name>",
    "/iq teammate schedule <@slack_user> daily <HH:mm> <timezone>",
    "/iq teammate schedule <@slack_user> weekly <day> <HH:mm> <timezone>"
  ].join("\n");
}

export function formatGoalList(): string {
  const goals = listGoals({ statuses: ["proposed", "active", "paused"], limit: 30 });

  return [
    "*Goals*",
    "",
    ...(goals.length
      ? goals.map(
          (goal) =>
            `- ${goal.id}: ${goal.name} [${goal.status}], owner=${formatPersonId(goal.ownerPersonId)}`
        )
      : ["- No goals configured"])
  ].join("\n");
}

export function handleGoalCommand(text: string, actorSlackUserId: string): string {
  const { action, rest } = splitCommandText(text);

  if (!action || action === "list") {
    return formatGoalList();
  }

  if (action === "create") {
    if (!rest) {
      return "Usage: /iq goal create <name>";
    }

    const goal = createGoal({ name: rest }, actorSlackUserId);
    return `Created goal ${goal.id}: ${goal.name}.`;
  }

  if (action === "assign") {
    const { token: goalId, rest: slackToken } = firstToken(rest);

    if (!goalId || !slackToken) {
      return "Usage: /iq goal assign <goal_id> <@slack_user>";
    }

    const goal = assignGoalOwner(goalId, normalizeSlackUserId(slackToken), actorSlackUserId);
    return `Assigned goal ${goal.id} to ${goal.ownerPersonId}.`;
  }

  return ["Usage:", "/iq goals", "/iq goal create <name>", "/iq goal assign <goal_id> <@slack_user>"].join("\n");
}

export function formatInitiativeList(): string {
  const initiatives = listInitiatives({ statuses: ["proposed", "active", "paused"], limit: 30 });

  return [
    "*Initiatives*",
    "",
    ...(initiatives.length
      ? initiatives.map(
          (initiative) =>
            `- ${initiative.id}: ${initiative.name} [${initiative.status}], goal=${initiative.goalId ?? "none"}, owner=${formatPersonId(initiative.ownerPersonId)}`
        )
      : ["- No initiatives configured"])
  ].join("\n");
}

export function handleInitiativeCommand(text: string, actorSlackUserId: string): string {
  const { action, rest } = splitCommandText(text);

  if (!action || action === "list") {
    return formatInitiativeList();
  }

  if (action === "create") {
    const { token: goalId, rest: name } = firstToken(rest);

    if (!goalId || !name) {
      return "Usage: /iq initiative create <goal_id|none> <name>";
    }

    const initiative = createInitiative(
      {
        goalId: goalId === "none" ? undefined : goalId,
        name
      },
      actorSlackUserId
    );
    return `Created initiative ${initiative.id}: ${initiative.name}.`;
  }

  if (action === "assign") {
    const { token: initiativeId, rest: slackToken } = firstToken(rest);

    if (!initiativeId || !slackToken) {
      return "Usage: /iq initiative assign <initiative_id> <@slack_user>";
    }

    const initiative = assignInitiativeOwner(
      initiativeId,
      normalizeSlackUserId(slackToken),
      actorSlackUserId
    );
    return `Assigned initiative ${initiative.id} to ${initiative.ownerPersonId}.`;
  }

  return [
    "Usage:",
    "/iq initiatives",
    "/iq initiative create <goal_id|none> <name>",
    "/iq initiative assign <initiative_id> <@slack_user>"
  ].join("\n");
}
