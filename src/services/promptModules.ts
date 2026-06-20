import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { createConfigEvent, createId, nowIso } from "../db/repositories";
import { promptModules, promptVersions } from "../db/schema";

export type ActivePromptModule = {
  id: string;
  name: string;
  description: string | null;
  activeVersionId: string;
  versionNumber: number;
  promptText: string;
};

export function getActivePromptModule(name: string): ActivePromptModule {
  const row = getDb()
    .select({
      id: promptModules.id,
      name: promptModules.name,
      description: promptModules.description,
      activeVersionId: promptModules.activeVersionId,
      versionNumber: promptVersions.versionNumber,
      promptText: promptVersions.promptText
    })
    .from(promptModules)
    .innerJoin(promptVersions, eq(promptModules.activeVersionId, promptVersions.id))
    .where(eq(promptModules.name, name))
    .limit(1)
    .get();

  if (!row || !row.activeVersionId) {
    throw new Error(`Prompt module is missing or has no active version: ${name}`);
  }

  return {
    ...row,
    activeVersionId: row.activeVersionId
  };
}

export function listPromptModulesWithVersions() {
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

export function createPromptModuleVersion(
  name: string,
  promptText: string,
  input: { actorSlackUserId?: string; changeReason?: string; description?: string } = {}
) {
  const result = getDb().transaction((tx) => {
    const module = tx
      .select()
      .from(promptModules)
      .where(eq(promptModules.name, name))
      .limit(1)
      .get();

    if (!module) {
      throw new Error(`Prompt module not found: ${name}`);
    }

    const timestamp = nowIso();
    const latestVersion = tx
      .select({ versionNumber: promptVersions.versionNumber })
      .from(promptVersions)
      .where(eq(promptVersions.promptModuleId, module.id))
      .orderBy(desc(promptVersions.versionNumber))
      .limit(1)
      .get();
    const version = {
      id: createId("promptv"),
      promptModuleId: module.id,
      versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
      promptText,
      changeReason: input.changeReason ?? "manual prompt update",
      createdBySlackUserId: input.actorSlackUserId,
      status: "active",
      createdAt: timestamp
    };

    if (module.activeVersionId) {
      tx.update(promptVersions)
        .set({ status: "superseded" })
        .where(eq(promptVersions.id, module.activeVersionId))
        .run();
    }

    tx.insert(promptVersions).values(version).run();
    tx.update(promptModules)
      .set({
        activeVersionId: version.id,
        description: input.description ?? module.description,
        updatedAt: timestamp
      })
      .where(eq(promptModules.id, module.id))
      .run();

    return {
      module: {
        ...module,
        activeVersionId: version.id,
        updatedAt: timestamp
      },
      version
    };
  });

  createConfigEvent({
    eventType: "prompt_version_created",
    actorSlackUserId: input.actorSlackUserId,
    targetType: "prompt_module",
    targetId: result.module.id,
    after: {
      name,
      versionNumber: result.version.versionNumber
    }
  });

  return result;
}

export function listPromptModuleVersions(name: string) {
  const module = getDb()
    .select()
    .from(promptModules)
    .where(eq(promptModules.name, name))
    .limit(1)
    .get();

  if (!module) {
    throw new Error(`Prompt module not found: ${name}`);
  }

  return getDb()
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.promptModuleId, module.id))
    .orderBy(desc(promptVersions.versionNumber))
    .all();
}

export function rollbackPromptModuleVersion(
  name: string,
  versionNumber: number,
  actorSlackUserId?: string
) {
  const result = getDb().transaction((tx) => {
    const module = tx
      .select()
      .from(promptModules)
      .where(eq(promptModules.name, name))
      .limit(1)
      .get();

    if (!module) {
      throw new Error(`Prompt module not found: ${name}`);
    }

    const targetVersion = tx
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.promptModuleId, module.id))
      .all()
      .find((version) => version.versionNumber === versionNumber);

    if (!targetVersion) {
      throw new Error(`Prompt version not found: ${name} v${versionNumber}`);
    }

    const timestamp = nowIso();
    tx.update(promptVersions)
      .set({ status: "superseded" })
      .where(eq(promptVersions.promptModuleId, module.id))
      .run();
    tx.update(promptVersions)
      .set({ status: "active" })
      .where(eq(promptVersions.id, targetVersion.id))
      .run();
    tx.update(promptModules)
      .set({
        activeVersionId: targetVersion.id,
        updatedAt: timestamp
      })
      .where(eq(promptModules.id, module.id))
      .run();

    return {
      module: {
        ...module,
        activeVersionId: targetVersion.id,
        updatedAt: timestamp
      },
      version: targetVersion
    };
  });

  createConfigEvent({
    eventType: "prompt_version_rolled_back",
    actorSlackUserId,
    targetType: "prompt_module",
    targetId: result.module.id,
    after: {
      name,
      versionNumber
    }
  });

  return result;
}
