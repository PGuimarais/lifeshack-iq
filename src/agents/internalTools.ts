import { createApprovalRequest } from "../services/approvals";
import { createContextEntry } from "../services/contextEntries";
import { createGoal, createInitiative, updateGoal } from "../services/operatingModel";
import { listOpenIssues } from "../services/issues";
import { createTask, type TaskPriority } from "../services/tasks";

export type OpenAiToolDefinition = {
  type: "function";
  name: string;
  description: string;
  strict: true;
  parameters: Record<string, unknown>;
};

export type AgentInternalToolCall = {
  name: string;
  arguments: unknown;
  output: unknown;
};

type ToolContext = {
  proposedByRunId?: string;
};

function nullableString(description: string) {
  return {
    type: ["string", "null"],
    description
  };
}

function toolSchema(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false
  };
}

export function getOpenAiToolDefinitions(): OpenAiToolDefinition[] {
  return [
    {
      type: "function",
      name: "read_open_issues",
      description: "Read currently open or snoozable LifeShack IQ issues. This has no side effects.",
      strict: true,
      parameters: toolSchema({
        limit: {
          type: "number",
          description: "Maximum number of issues to return."
        }
      })
    },
    {
      type: "function",
      name: "create_task",
      description:
        "Create an internal LifeShack IQ task. This is safe but persistent; use it only for concrete follow-up work.",
      strict: true,
      parameters: toolSchema({
        name: {
          type: "string",
          description: "Short task title."
        },
        description: nullableString("Longer task description."),
        issueId: nullableString("Related issue ID, if any."),
        initiativeId: nullableString("Related initiative ID, if any."),
        ownerSlackUserId: nullableString("Slack user ID for owner, if known."),
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Task priority."
        },
        dueDate: nullableString("Due date as YYYY-MM-DD, if known.")
      })
    },
    {
      type: "function",
      name: "create_initiative",
      description:
        "Create a LifeShack initiative linked to an optional goal. Use when meeting notes identify a concrete stream of work.",
      strict: true,
      parameters: toolSchema({
        goalId: nullableString("Related goal ID, if known."),
        name: {
          type: "string",
          description: "Initiative name."
        },
        description: nullableString("Initiative description."),
        ownerSlackUserId: nullableString("Slack user ID for owner, if known."),
        progress: nullableString("Current progress or status note.")
      })
    },
    {
      type: "function",
      name: "propose_goal",
      description:
        "Create a proposed LifeShack business goal for human review. Proposed goals do not mark work as committed.",
      strict: true,
      parameters: toolSchema({
        name: {
          type: "string",
          description: "Goal name."
        },
        description: nullableString("Goal description."),
        area: nullableString("Business area, such as revenue, operations, product, or customer success."),
        ownerSlackUserId: nullableString("Slack user ID for proposed owner, if known."),
        targetMetric: nullableString("Metric this goal should move."),
        targetValue: nullableString("Target value for the metric."),
        dueDate: nullableString("Due date as YYYY-MM-DD, if known.")
      })
    },
    {
      type: "function",
      name: "update_goal",
      description:
        "Update an existing goal only when the transcript explicitly changes its owner, status, target, due date, or description.",
      strict: true,
      parameters: toolSchema({
        goalId: {
          type: "string",
          description: "Existing goal ID to update."
        },
        name: nullableString("Replacement goal name, if explicitly changed."),
        description: nullableString("Replacement or clarified goal description, if explicitly changed."),
        area: nullableString("Business area, if explicitly changed."),
        ownerSlackUserId: nullableString("Slack user ID for owner, if explicitly assigned."),
        targetMetric: nullableString("Target metric, if explicitly changed."),
        targetValue: nullableString("Target value, if explicitly changed."),
        dueDate: nullableString("Due date as YYYY-MM-DD, if explicitly changed."),
        status: {
          type: ["string", "null"],
          enum: ["proposed", "active", "paused", "completed", "cancelled", null],
          description: "Goal status, if explicitly changed."
        }
      })
    },
    {
      type: "function",
      name: "record_context_note",
      description:
        "Record durable business context from a meeting, such as decisions, customer insights, risks, strategy notes, or constraints.",
      strict: true,
      parameters: toolSchema({
        title: {
          type: "string",
          description: "Short title for the context note."
        },
        body: {
          type: "string",
          description: "Concrete context note with enough detail to be useful later."
        },
        tags: {
          type: "array",
          items: {
            type: "string"
          },
          description: "Searchable tags."
        },
        importance: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Context importance."
        },
        relatedGoalId: nullableString("Related goal ID, if known."),
        relatedInitiativeId: nullableString("Related initiative ID, if known."),
        relatedTaskId: nullableString("Related task ID, if known.")
      })
    },
    {
      type: "function",
      name: "request_approval",
      description:
        "Create an approval request for sensitive work. This does not execute the sensitive action.",
      strict: true,
      parameters: toolSchema({
        actionType: {
          type: "string",
          description: "Sensitive action type, such as refund, customer_email, aws_change, or production_change."
        },
        requestMessage: {
          type: "string",
          description: "Human-readable approval request."
        },
        requestedFromSlackUserId: nullableString("Slack user ID to request approval from, if known."),
        actionPayloadJson: nullableString("JSON string describing the proposed action payload.")
      })
    }
  ];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parsePayloadJson(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

export async function executeInternalTool(
  name: string,
  args: unknown,
  context: ToolContext = {}
): Promise<unknown> {
  const input = asRecord(args);

  if (name === "read_open_issues") {
    const limit = typeof input.limit === "number" ? Math.max(1, Math.min(input.limit, 50)) : 20;
    return {
      issues: listOpenIssues({ limit }).map((issue) => ({
        id: issue.id,
        title: issue.title,
        severity: issue.severity,
        area: issue.area,
        status: issue.status,
        ownerPersonId: issue.ownerPersonId
      }))
    };
  }

  if (name === "create_task") {
    const task = createTask({
      name: stringOrUndefined(input.name) ?? "Untitled IQ task",
      description: stringOrUndefined(input.description),
      issueId: stringOrUndefined(input.issueId),
      initiativeId: stringOrUndefined(input.initiativeId),
      ownerSlackUserId: stringOrUndefined(input.ownerSlackUserId),
      priority: (stringOrUndefined(input.priority) ?? "medium") as TaskPriority,
      dueDate: stringOrUndefined(input.dueDate),
      links: {
        source: "openai_tool_call"
      }
    });
    return { task };
  }

  if (name === "create_initiative") {
    const initiative = createInitiative({
      goalId: stringOrUndefined(input.goalId),
      name: stringOrUndefined(input.name) ?? "Untitled initiative",
      description: stringOrUndefined(input.description),
      ownerSlackUserId: stringOrUndefined(input.ownerSlackUserId),
      progress: stringOrUndefined(input.progress)
    });
    return { initiative };
  }

  if (name === "propose_goal") {
    const goal = createGoal({
      name: stringOrUndefined(input.name) ?? "Untitled proposed goal",
      description: stringOrUndefined(input.description),
      area: stringOrUndefined(input.area),
      ownerSlackUserId: stringOrUndefined(input.ownerSlackUserId),
      targetMetric: stringOrUndefined(input.targetMetric),
      targetValue: stringOrUndefined(input.targetValue),
      dueDate: stringOrUndefined(input.dueDate),
      status: "proposed"
    });
    return { goal };
  }

  if (name === "update_goal") {
    const goalId = stringOrUndefined(input.goalId);

    if (!goalId) {
      throw new Error("update_goal requires goalId.");
    }

    const goal = updateGoal(goalId, {
      name: stringOrUndefined(input.name),
      description: stringOrUndefined(input.description),
      area: stringOrUndefined(input.area),
      ownerSlackUserId: stringOrUndefined(input.ownerSlackUserId),
      targetMetric: stringOrUndefined(input.targetMetric),
      targetValue: stringOrUndefined(input.targetValue),
      dueDate: stringOrUndefined(input.dueDate),
      status: stringOrUndefined(input.status) as
        | "proposed"
        | "active"
        | "paused"
        | "completed"
        | "cancelled"
        | undefined
    });
    return { goal };
  }

  if (name === "record_context_note") {
    const tags = Array.isArray(input.tags)
      ? input.tags.filter((tag): tag is string => typeof tag === "string")
      : [];
    const contextEntry = createContextEntry({
      sourceType: "agent_tool",
      sourceId: context.proposedByRunId,
      title: stringOrUndefined(input.title) ?? "Meeting context",
      body: stringOrUndefined(input.body) ?? "No context body provided.",
      tags,
      importance: (stringOrUndefined(input.importance) ?? "medium") as "low" | "medium" | "high",
      relatedGoalId: stringOrUndefined(input.relatedGoalId),
      relatedInitiativeId: stringOrUndefined(input.relatedInitiativeId),
      relatedTaskId: stringOrUndefined(input.relatedTaskId)
    });
    return { contextEntry };
  }

  if (name === "request_approval") {
    const approval = createApprovalRequest({
      actionType: stringOrUndefined(input.actionType) ?? "unknown",
      requestMessage: stringOrUndefined(input.requestMessage) ?? "Approve proposed IQ action?",
      requestedFromSlackUserId: stringOrUndefined(input.requestedFromSlackUserId),
      actionPayload: parsePayloadJson(input.actionPayloadJson),
      proposedByRunId: context.proposedByRunId
    });
    return { approval };
  }

  throw new Error(`Unknown internal tool: ${name}`);
}
