import type { WorkflowContext } from "../services/workflowRegistry";

type WorkflowPayload = {
  text?: string;
  useAgent?: boolean;
};

function asPayload(value: unknown): WorkflowPayload {
  return value && typeof value === "object" ? (value as WorkflowPayload) : {};
}

export function shouldUseAgent(context: WorkflowContext): boolean {
  const payload = asPayload(context.payload);

  if (payload.useAgent === true) {
    return true;
  }

  return typeof payload.text === "string" && payload.text.split(/\s+/).includes("--agent");
}
