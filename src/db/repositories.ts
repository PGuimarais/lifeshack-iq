import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  backupRuns,
  configEvents,
  metaChangeRequests,
  metaConfigs,
  metaConfigVersions,
  promptModules,
  promptVersions
} from "./schema";

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix?: string): string {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function jsonStringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ error: "unserializable_value" });
  }
}

export function jsonParseSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type MetaChangeRequestInput = {
  requestedBySlackUserId?: string;
  requestText: string;
  proposedDiff?: unknown;
  riskLevel?: "low" | "medium" | "high" | "unknown";
  status?: "proposed" | "applied" | "cancelled" | "rejected";
};

export function createMetaChangeRequest(input: MetaChangeRequestInput) {
  const createdAt = nowIso();
  const row = {
    id: createId("mcr"),
    requestedBySlackUserId: input.requestedBySlackUserId,
    requestText: input.requestText,
    proposedDiffJson:
      input.proposedDiff === undefined ? null : jsonStringifySafe(input.proposedDiff),
    riskLevel: input.riskLevel ?? "unknown",
    status: input.status ?? "proposed",
    approvedBySlackUserId: null,
    createdAt,
    resolvedAt: null
  };

  getDb().insert(metaChangeRequests).values(row).run();
  return row;
}

export function listRecentMetaChangeRequests(limit = 10) {
  return getDb()
    .select()
    .from(metaChangeRequests)
    .orderBy(desc(metaChangeRequests.createdAt))
    .limit(limit)
    .all();
}

export type ConfigEventInput = {
  eventType: string;
  actorSlackUserId?: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
};

export function createConfigEvent(input: ConfigEventInput) {
  const row = {
    id: createId("evt"),
    eventType: input.eventType,
    actorSlackUserId: input.actorSlackUserId,
    targetType: input.targetType,
    targetId: input.targetId,
    beforeJson: input.before === undefined ? null : jsonStringifySafe(input.before),
    afterJson: input.after === undefined ? null : jsonStringifySafe(input.after),
    createdAt: nowIso()
  };

  getDb().insert(configEvents).values(row).run();
  return row;
}

export function upsertMetaConfig(
  namespace: string,
  key: string,
  value: unknown,
  actorSlackUserId?: string,
  changeReason = "upsert"
) {
  const db = getDb();
  const valueJson = jsonStringifySafe(value);

  return db.transaction((tx) => {
    const existingConfig = tx
      .select()
      .from(metaConfigs)
      .where(and(eq(metaConfigs.namespace, namespace), eq(metaConfigs.key, key)))
      .limit(1)
      .get();
    const timestamp = nowIso();

    const config =
      existingConfig ??
      {
        id: createId("cfg"),
        namespace,
        key,
        activeVersionId: null,
        createdAt: timestamp,
        updatedAt: timestamp
      };

    if (!existingConfig) {
      tx.insert(metaConfigs).values(config).run();
    }

    const activeVersion = config.activeVersionId
      ? tx
          .select()
          .from(metaConfigVersions)
          .where(eq(metaConfigVersions.id, config.activeVersionId))
          .limit(1)
          .get()
      : undefined;

    if (activeVersion?.valueJson === valueJson) {
      return { config, version: activeVersion, changed: false };
    }

    if (config.activeVersionId) {
      tx.update(metaConfigVersions)
        .set({ status: "superseded" })
        .where(eq(metaConfigVersions.id, config.activeVersionId))
        .run();
    }

    const latestVersion = tx
      .select({ versionNumber: metaConfigVersions.versionNumber })
      .from(metaConfigVersions)
      .where(eq(metaConfigVersions.configId, config.id))
      .orderBy(desc(metaConfigVersions.versionNumber))
      .limit(1)
      .get();
    const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;
    const version = {
      id: createId("cfgv"),
      configId: config.id,
      versionNumber,
      valueJson,
      changeReason,
      createdBySlackUserId: actorSlackUserId,
      status: "active",
      createdAt: timestamp
    };

    tx.insert(metaConfigVersions).values(version).run();
    tx.update(metaConfigs)
      .set({ activeVersionId: version.id, updatedAt: timestamp })
      .where(eq(metaConfigs.id, config.id))
      .run();

    return {
      config: { ...config, activeVersionId: version.id, updatedAt: timestamp },
      version,
      changed: true
    };
  });
}

export function listActiveMetaConfigs() {
  const rows = getDb()
    .select({
      id: metaConfigs.id,
      namespace: metaConfigs.namespace,
      key: metaConfigs.key,
      versionId: metaConfigVersions.id,
      versionNumber: metaConfigVersions.versionNumber,
      valueJson: metaConfigVersions.valueJson,
      updatedAt: metaConfigs.updatedAt
    })
    .from(metaConfigs)
    .leftJoin(metaConfigVersions, eq(metaConfigs.activeVersionId, metaConfigVersions.id))
    .orderBy(metaConfigs.namespace, metaConfigs.key)
    .all();

  return rows.map((row) => ({
    ...row,
    value: jsonParseSafe<unknown>(row.valueJson, null)
  }));
}

export function createPromptModuleIfMissing(
  name: string,
  description: string,
  promptText: string
) {
  const db = getDb();

  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(promptModules)
      .where(eq(promptModules.name, name))
      .limit(1)
      .get();

    if (existing) {
      return { module: existing, created: false };
    }

    const timestamp = nowIso();
    const module = {
      id: createId("prompt"),
      name,
      description,
      activeVersionId: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const version = {
      id: createId("promptv"),
      promptModuleId: module.id,
      versionNumber: 1,
      promptText,
      changeReason: "default seed",
      createdBySlackUserId: null,
      status: "active",
      createdAt: timestamp
    };

    tx.insert(promptModules).values(module).run();
    tx.insert(promptVersions).values(version).run();
    tx.update(promptModules)
      .set({ activeVersionId: version.id, updatedAt: timestamp })
      .where(eq(promptModules.id, module.id))
      .run();

    return {
      module: { ...module, activeVersionId: version.id, updatedAt: timestamp },
      version,
      created: true
    };
  });
}

export function listPromptModules() {
  return getDb()
    .select({
      id: promptModules.id,
      name: promptModules.name,
      description: promptModules.description,
      activeVersionId: promptModules.activeVersionId,
      activeVersionNumber: promptVersions.versionNumber,
      createdAt: promptModules.createdAt,
      updatedAt: promptModules.updatedAt
    })
    .from(promptModules)
    .leftJoin(promptVersions, eq(promptModules.activeVersionId, promptVersions.id))
    .orderBy(promptModules.name)
    .all();
}

export function getRuntimeDbSummary() {
  const lastBackupRun =
    getDb()
      .select()
      .from(backupRuns)
      .orderBy(desc(backupRuns.startedAt))
      .limit(1)
      .get() ?? null;
  const metaChangeCount = getDb()
    .get<{ count: number }>(sql`select count(*) as count from ${metaChangeRequests}`)
    ?.count ?? 0;

  return {
    lastBackupRun,
    metaChangeRequestCount: Number(metaChangeCount)
  };
}

export type BackupRunStartedInput = {
  localPath?: string;
};

export function createBackupRunStarted(input: BackupRunStartedInput = {}) {
  const timestamp = nowIso();
  const row = {
    id: createId("backup"),
    startedAt: timestamp,
    finishedAt: null,
    status: "started",
    localPath: input.localPath,
    s3Uri: null,
    sha256: null,
    sizeBytes: null,
    error: null,
    createdAt: timestamp
  };

  getDb().insert(backupRuns).values(row).run();
  return row;
}

export type BackupRunCompleteInput = {
  localPath?: string;
  s3Uri?: string;
  sha256?: string;
  sizeBytes?: number;
};

export function completeBackupRun(id: string, input: BackupRunCompleteInput = {}) {
  const update = {
    finishedAt: nowIso(),
    status: "succeeded",
    localPath: input.localPath,
    s3Uri: input.s3Uri,
    sha256: input.sha256,
    sizeBytes: input.sizeBytes,
    error: null
  };

  getDb().update(backupRuns).set(update).where(eq(backupRuns.id, id)).run();
  return { id, ...update };
}

export function failBackupRun(id: string, error: string) {
  const update = {
    finishedAt: nowIso(),
    status: "failed",
    error
  };

  getDb().update(backupRuns).set(update).where(eq(backupRuns.id, id)).run();
  return { id, ...update };
}

const defaultMetaConfig = {
  report_style: {
    executive_first: true,
    critical_issues_before_detail: true,
    include_recommended_actions: true
  },
  safety: {
    refunds_require_approval: true,
    customer_emails_require_approval: true,
    production_changes_require_approval: true,
    destructive_aws_actions_require_approval: true
  },
  workflow: {
    runtime: "local",
    daily_report_enabled: false,
    critical_scan_enabled: false,
    weekly_reflection_enabled: false
  }
};

const defaultPromptModules = [
  {
    name: "base_operating_principles",
    description: "Core operating behavior for LifeShack IQ.",
    promptText:
      "You are LifeShack IQ, an internal operating system for LifeShack. Be concise, evidence-based, and action-oriented. Do not perform sensitive actions without approval."
  },
  {
    name: "daily_critical_scan_prompt",
    description: "Future daily critical scan workflow prompt.",
    promptText:
      "Analyze company data for critical operational issues. Prefer concrete evidence and identify severity."
  },
  {
    name: "daily_group_report_prompt",
    description: "Future daily group report workflow prompt.",
    promptText:
      "Produce an executive daily business report with critical issues first, followed by revenue, operations, application quality, and recommended actions."
  },
  {
    name: "weekly_reflection_prompt",
    description: "Future weekly reflection workflow prompt.",
    promptText:
      "Reflect on the week of company data and classify strategies as WORKING, NOT_WORKING, or NOT_ENOUGH_DATA."
  },
  {
    name: "teammate_checkin_prompt",
    description: "Future teammate check-in workflow prompt.",
    promptText:
      "Check in with a teammate about active tasks, blockers, and relevant next actions."
  },
  {
    name: "meta_interpreter_prompt",
    description: "Future meta feedback interpretation prompt.",
    promptText:
      "Interpret user feedback as proposed configuration or prompt changes. Preserve safety invariants."
  }
];

export function seedDefaults(): void {
  for (const [key, value] of Object.entries(defaultMetaConfig)) {
    upsertMetaConfig("meta", key, value, undefined, "default seed");
  }

  for (const promptModule of defaultPromptModules) {
    createPromptModuleIfMissing(
      promptModule.name,
      promptModule.description,
      promptModule.promptText
    );
  }
}
