import { claimNextJob, completeJob, failJob, type QueueJob } from "../db/queue";
import { logger } from "../logger/logger";
import { notifyWorkflowResult } from "../slack/notifier";
import { runWorkflow } from "./workflowRegistry";

export async function processNextJob(): Promise<QueueJob | null> {
  const job = claimNextJob();

  if (!job) {
    return null;
  }

  try {
    const result = await runWorkflow(job.type, {
      job,
      payload: job.payload,
      source: "worker"
    });

    completeJob(job.id);
    try {
      await notifyWorkflowResult(result);
    } catch (notificationError) {
      logger.error(
        { err: notificationError, jobId: job.id, type: job.type },
        "Failed to post IQ workflow notification."
      );
    }
    logger.info({ jobId: job.id, type: job.type, result }, "IQ job completed.");
    return job;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const updated = failJob(job.id, message);
    logger.error({ err: error, jobId: job.id, type: job.type, status: updated.status }, "IQ job failed.");
    return updated;
  }
}

export type JobWorkerHandle = {
  processOnce: () => Promise<QueueJob | null>;
  stop: () => void;
};

export function startJobWorker(input: { pollIntervalMs?: number } = {}): JobWorkerHandle {
  const pollIntervalMs = input.pollIntervalMs ?? 5_000;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) {
      return;
    }

    running = true;

    try {
      await processNextJob();
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, pollIntervalMs);
  void tick();

  return {
    processOnce: processNextJob,
    stop: () => clearInterval(timer)
  };
}
