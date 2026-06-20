import type { App } from "@slack/bolt";
import { logger } from "../logger/logger";
import {
  applyMetaChangeRequest,
  cancelMetaChangeRequest
} from "../services/metaConfig";
import { formatMetaActionResult, safeErrorMessage } from "./messages";
import { registerActionButtonHandlers } from "./actionButtons";

function getActionValue(action: unknown): string | undefined {
  return action &&
    typeof action === "object" &&
    "value" in action &&
    typeof action.value === "string"
    ? action.value
    : undefined;
}

function getActorSlackUserId(body: unknown): string | undefined {
  return body &&
    typeof body === "object" &&
    "user" in body &&
    body.user &&
    typeof body.user === "object" &&
    "id" in body.user &&
    typeof body.user.id === "string"
    ? body.user.id
    : undefined;
}

export function registerInteractionHandlers(app: App): void {
  registerActionButtonHandlers(app, {
    safeErrorMessage,
    onError: (error, message) => logger.error({ err: error }, message)
  });

  app.action("meta_apply", async ({ ack, action, body, respond }) => {
    await ack();

    try {
      const requestId = getActionValue(action);

      if (!requestId) {
        await respond?.("No meta change request id was attached to that action.");
        return;
      }

      applyMetaChangeRequest(requestId, getActorSlackUserId(body));
      await respond?.(formatMetaActionResult("applied", requestId));
    } catch (error) {
      logger.error({ err: error }, "Failed to apply meta change request");
      await respond?.(safeErrorMessage);
    }
  });

  app.action("meta_cancel", async ({ ack, action, body, respond }) => {
    await ack();

    try {
      const requestId = getActionValue(action);

      if (!requestId) {
        await respond?.("No meta change request id was attached to that action.");
        return;
      }

      cancelMetaChangeRequest(requestId, getActorSlackUserId(body));
      await respond?.(formatMetaActionResult("cancelled", requestId));
    } catch (error) {
      logger.error({ err: error }, "Failed to cancel meta change request");
      await respond?.(safeErrorMessage);
    }
  });
}
