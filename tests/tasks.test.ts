import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assignTask,
  createTask,
  getTask,
  listOpenTasks,
  markTaskDone
} from "../src/services/tasks";
import { linkSlackThread, listSlackLinksForTask } from "../src/services/slackLinks";
import { configureTestDb, migrateTestDb, removeTestDb } from "./testDb";

describe("tasks service", () => {
  let databasePath: string;

  beforeEach(() => {
    databasePath = configureTestDb("tasks");
    migrateTestDb();
  });

  afterEach(() => {
    removeTestDb(databasePath);
  });

  it("creates, assigns, marks done, and links tasks", () => {
    const task = createTask({ name: "Write the playbook" });
    const assigned = assignTask(task.id, "U123");
    linkSlackThread({ channelId: "C123", threadTs: "123.456", taskId: task.id });

    expect(listOpenTasks()).toHaveLength(1);
    expect(assigned.ownerPersonId).toBeTruthy();
    expect(assigned.status).toBe("in_progress");
    expect(listSlackLinksForTask(task.id)).toHaveLength(1);

    const done = markTaskDone(task.id, "U123");

    expect(done.status).toBe("done");
    expect(listOpenTasks()).toHaveLength(0);
    expect(getTask(task.id).updatedAt).toBeTruthy();
  });
});
