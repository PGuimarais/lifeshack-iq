import {
  enqueueJob,
  hasPendingJobOfType,
  type QueueJob,
  type WorkflowJobType
} from "../db/queue";
import { logger } from "../logger/logger";
import { checkOperationalReadiness } from "./readiness";
import { scheduleDueWorkflowJobs } from "./workflowSchedules";

export type ScheduleDefinition = {
  type: WorkflowJobType;
  runEveryMs: number;
  initialDelayMs: number;
  payload?: unknown;
  productionWorkflow?: boolean;
};

export const scheduleDefinitions: ScheduleDefinition[] = [
  {
    type: "daily_critical_scan",
    runEveryMs: 24 * 60 * 60 * 1000,
    initialDelayMs: 0,
    productionWorkflow: true
  },
  {
    type: "daily_group_report",
    runEveryMs: 24 * 60 * 60 * 1000,
    initialDelayMs: 0,
    productionWorkflow: true
  },
  {
    type: "weekly_reflection",
    runEveryMs: 7 * 24 * 60 * 60 * 1000,
    initialDelayMs: 0,
    productionWorkflow: true
  },
  {
    type: "teammate_checkin",
    runEveryMs: 24 * 60 * 60 * 1000,
    initialDelayMs: 0,
    productionWorkflow: true
  },
  {
    type: "sqlite_backup_to_s3",
    runEveryMs: 24 * 60 * 60 * 1000,
    initialDelayMs: 0
  },
  {
    type: "meta_change_request",
    runEveryMs: 5 * 60 * 1000,
    initialDelayMs: 0
  }
];

export function getScheduleDefinition(type: WorkflowJobType): ScheduleDefinition | null {
  return scheduleDefinitions.find((definition) => definition.type === type) ?? null;
}

export function scheduleDefaultJobs(
  now = new Date(),
  input: { includeProductionWorkflows?: boolean } = {}
): QueueJob[] {
  const created: QueueJob[] = [];
  const includeProductionWorkflows = input.includeProductionWorkflows ?? true;

  for (const definition of scheduleDefinitions) {
    if (definition.productionWorkflow && !includeProductionWorkflows) {
      continue;
    }

    if (hasPendingJobOfType(definition.type)) {
      continue;
    }

    created.push(
      enqueueJob({
        type: definition.type,
        payload: definition.payload ?? {
          scheduled: true,
          source: "scheduler"
        },
        runAt: new Date(now.getTime() + definition.initialDelayMs)
      })
    );
  }

  return created;
}

export function scheduleNextWorkflowRun(
  type: WorkflowJobType,
  from = new Date(),
  input: { includeProductionWorkflows?: boolean } = {}
): QueueJob | null {
  const definition = getScheduleDefinition(type);
  const includeProductionWorkflows = input.includeProductionWorkflows ?? true;

  if (!definition || hasPendingJobOfType(type)) {
    return null;
  }

  if (definition.productionWorkflow && !includeProductionWorkflows) {
    return null;
  }

  return enqueueJob({
    type,
    payload: definition.payload ?? {
      scheduled: true,
      source: "scheduler"
    },
    runAt: new Date(from.getTime() + definition.runEveryMs)
  });
}

export type SchedulerHandle = {
  stop: () => void;
};

export function startScheduler(input: { intervalMs?: number } = {}): SchedulerHandle {
  const intervalMs = input.intervalMs ?? 60_000;
  const run = async (): Promise<void> => {
    const readiness = await checkOperationalReadiness();
    const includeProductionWorkflows = readiness.ready;
    const created = scheduleDueWorkflowJobs(new Date(), { includeProductionWorkflows });

    if (!includeProductionWorkflows) {
      logger.info(
        {
          checks: readiness.checks,
          connectorHealth: readiness.connectorHealth.map((health) => ({
            name: health.name,
            status: health.status,
            mode: health.mode,
            fallbackUsed: health.fallbackUsed
          }))
        },
        "Scheduled production workflows are gated by readiness."
      );
    }

    if (created.length > 0) {
      logger.info({ createdJobs: created.map((job) => job.type) }, "Scheduled IQ workflow jobs.");
    }
  };

  void run();
  const timer = setInterval(run, intervalMs);

  return {
    stop: () => clearInterval(timer)
  };
}
