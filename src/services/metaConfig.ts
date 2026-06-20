import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  createConfigEvent,
  createMetaChangeRequest,
  jsonParseSafe,
  nowIso,
  upsertMetaConfig
} from "../db/repositories";
import {
  configEvents,
  metaChangeRequests,
  metaConfigs,
  metaConfigVersions
} from "../db/schema";
import { assertSafetyInvariants } from "./safetyInvariants";
import {
  createPromptModuleVersion,
  listPromptModulesWithVersions,
  rollbackPromptModuleVersion
} from "./promptModules";

export type MetaTarget =
  | {
      kind: "config";
      namespace: string;
      key: string;
    }
  | {
      kind: "prompt";
      name: string;
    };

export function parseMetaTarget(targetExpression: string): MetaTarget {
  const trimmed = targetExpression.trim();

  if (!trimmed) {
    throw new Error("Meta target is required.");
  }

  const [namespaceOrKind, ...rest] = trimmed.split(".");

  if (namespaceOrKind === "prompt") {
    const name = rest.join(".");

    if (!name) {
      throw new Error("Prompt target must look like prompt.<module_name>.");
    }

    return { kind: "prompt", name };
  }

  if (rest.length === 0) {
    return {
      kind: "config",
      namespace: "meta",
      key: namespaceOrKind
    };
  }

  return {
    kind: "config",
    namespace: namespaceOrKind,
    key: rest.join(".")
  };
}

export function parseMetaValue(rawValue: string): unknown {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    throw new Error("Meta value is required.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export function showMetaControlPlane() {
  return {
    configs: getDb()
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
      .all()
      .map((config) => ({
        ...config,
        value: jsonParseSafe(config.valueJson, null)
      })),
    promptModules: listPromptModulesWithVersions()
  };
}

export function learnMetaInstruction(instruction: string, actorSlackUserId?: string) {
  if (!instruction.trim()) {
    throw new Error("Instruction is required.");
  }

  const request = createMetaChangeRequest({
    requestedBySlackUserId: actorSlackUserId,
    requestText: instruction.trim(),
    proposedDiff: null,
    riskLevel: "unknown",
    status: "proposed"
  });

  createConfigEvent({
    eventType: "meta_change_requested",
    actorSlackUserId,
    targetType: "meta_change_request",
    targetId: request.id,
    after: {
      requestText: request.requestText,
      status: request.status,
      riskLevel: request.riskLevel
    }
  });

  return request;
}

export function setMetaTarget(
  targetExpression: string,
  rawValue: string,
  actorSlackUserId?: string,
  changeReason = "manual meta set"
) {
  const target = parseMetaTarget(targetExpression);
  const value = target.kind === "prompt" ? rawValue.trim() : parseMetaValue(rawValue);

  return setMetaTargetValue(target, value, actorSlackUserId, changeReason);
}

export function setMetaTargetValue(
  target: MetaTarget,
  value: unknown,
  actorSlackUserId?: string,
  changeReason = "manual meta set"
) {
  if (target.kind === "prompt") {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("Prompt updates require non-empty prompt text.");
    }

    return {
      kind: "prompt" as const,
      ...createPromptModuleVersion(target.name, value.trim(), {
        actorSlackUserId,
        changeReason
      })
    };
  }

  assertSafetyInvariants(target.namespace, target.key, value);
  const result = upsertMetaConfig(
    target.namespace,
    target.key,
    value,
    actorSlackUserId,
    changeReason
  );

  createConfigEvent({
    eventType: "meta_config_set",
    actorSlackUserId,
    targetType: "meta_config",
    targetId: result.config.id,
    after: {
      namespace: target.namespace,
      key: target.key,
      versionNumber: result.version?.versionNumber,
      value
    }
  });

  return {
    kind: "config" as const,
    ...result
  };
}

export function listMetaConfigVersions(namespace: string, key: string) {
  const config = getDb()
    .select()
    .from(metaConfigs)
    .where(and(eq(metaConfigs.namespace, namespace), eq(metaConfigs.key, key)))
    .limit(1)
    .get();

  if (!config) {
    throw new Error(`Meta config not found: ${namespace}.${key}`);
  }

  return getDb()
    .select()
    .from(metaConfigVersions)
    .where(eq(metaConfigVersions.configId, config.id))
    .orderBy(desc(metaConfigVersions.versionNumber))
    .all()
    .map((version) => ({
      ...version,
      value: jsonParseSafe(version.valueJson, null)
    }));
}

export function rollbackMetaTarget(
  targetExpression: string,
  versionNumber: number,
  actorSlackUserId?: string
) {
  const target = parseMetaTarget(targetExpression);

  if (target.kind === "prompt") {
    return {
      kind: "prompt" as const,
      ...rollbackPromptModuleVersion(target.name, versionNumber, actorSlackUserId)
    };
  }

  const result = getDb().transaction((tx) => {
    const config = tx
      .select()
      .from(metaConfigs)
      .where(and(eq(metaConfigs.namespace, target.namespace), eq(metaConfigs.key, target.key)))
      .limit(1)
      .get();

    if (!config) {
      throw new Error(`Meta config not found: ${target.namespace}.${target.key}`);
    }

    const versions = tx
      .select()
      .from(metaConfigVersions)
      .where(eq(metaConfigVersions.configId, config.id))
      .all();
    const targetVersion = versions.find((version) => version.versionNumber === versionNumber);

    if (!targetVersion) {
      throw new Error(`Meta config version not found: ${target.namespace}.${target.key} v${versionNumber}`);
    }

    const value = jsonParseSafe(targetVersion.valueJson, null);
    assertSafetyInvariants(target.namespace, target.key, value);
    const timestamp = nowIso();

    tx.update(metaConfigVersions)
      .set({ status: "superseded" })
      .where(eq(metaConfigVersions.configId, config.id))
      .run();
    tx.update(metaConfigVersions)
      .set({ status: "active" })
      .where(eq(metaConfigVersions.id, targetVersion.id))
      .run();
    tx.update(metaConfigs)
      .set({ activeVersionId: targetVersion.id, updatedAt: timestamp })
      .where(eq(metaConfigs.id, config.id))
      .run();

    return {
      kind: "config" as const,
      config: {
        ...config,
        activeVersionId: targetVersion.id,
        updatedAt: timestamp
      },
      version: targetVersion,
      value
    };
  });

  createConfigEvent({
    eventType: "meta_config_rolled_back",
    actorSlackUserId,
    targetType: "meta_config",
    targetId: result.config.id,
    after: {
      namespace: target.namespace,
      key: target.key,
      versionNumber
    }
  });

  return result;
}

export function getMetaHistory(limit = 10) {
  return {
    events: getDb()
      .select()
      .from(configEvents)
      .orderBy(desc(configEvents.createdAt))
      .limit(limit)
      .all(),
    requests: getDb()
      .select()
      .from(metaChangeRequests)
      .orderBy(desc(metaChangeRequests.createdAt))
      .limit(limit)
      .all()
  };
}

export function applyMetaChangeRequest(id: string, actorSlackUserId?: string) {
  const request = getDb()
    .select()
    .from(metaChangeRequests)
    .where(eq(metaChangeRequests.id, id))
    .limit(1)
    .get();

  if (!request) {
    throw new Error(`Meta change request not found: ${id}`);
  }

  if (request.status !== "proposed") {
    throw new Error(`Meta change request is not proposed: ${id}`);
  }

  const proposedDiff = jsonParseSafe<{
    target?: MetaTarget;
    value?: unknown;
  } | null>(request.proposedDiffJson, null) ?? {};

  if (proposedDiff.target && Object.prototype.hasOwnProperty.call(proposedDiff, "value")) {
    setMetaTargetValue(
      proposedDiff.target,
      proposedDiff.value,
      actorSlackUserId,
      `applied meta change request ${id}`
    );
  }

  const resolvedAt = nowIso();
  getDb()
    .update(metaChangeRequests)
    .set({
      status: "applied",
      approvedBySlackUserId: actorSlackUserId,
      resolvedAt
    })
    .where(eq(metaChangeRequests.id, id))
    .run();

  createConfigEvent({
    eventType: "meta_change_applied",
    actorSlackUserId,
    targetType: "meta_change_request",
    targetId: id,
    after: {
      status: "applied",
      resolvedAt
    }
  });

  return {
    ...request,
    status: "applied",
    approvedBySlackUserId: actorSlackUserId,
    resolvedAt
  };
}

export function cancelMetaChangeRequest(id: string, actorSlackUserId?: string) {
  const request = getDb()
    .select()
    .from(metaChangeRequests)
    .where(eq(metaChangeRequests.id, id))
    .limit(1)
    .get();

  if (!request) {
    throw new Error(`Meta change request not found: ${id}`);
  }

  const resolvedAt = nowIso();
  getDb()
    .update(metaChangeRequests)
    .set({
      status: "cancelled",
      resolvedAt
    })
    .where(eq(metaChangeRequests.id, id))
    .run();

  createConfigEvent({
    eventType: "meta_change_cancelled",
    actorSlackUserId,
    targetType: "meta_change_request",
    targetId: id,
    after: {
      status: "cancelled",
      resolvedAt
    }
  });

  return {
    ...request,
    status: "cancelled",
    resolvedAt
  };
}
