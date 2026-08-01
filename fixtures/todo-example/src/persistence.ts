import { readFileSync, writeFileSync } from "node:fs";
import type { Task } from "./task.js";

/** Serializes a task list to a JSON string suitable for writing to disk. */
export function serializeTasks(tasks: readonly Task[]): string {
  return JSON.stringify(tasks, null, 2);
}

/** Parses a JSON string previously produced by {@link serializeTasks} back into tasks. */
export function deserializeTasks(json: string): Task[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("Task file did not contain a JSON array.");
  }
  return parsed as Task[];
}

/** Writes the task list to `filePath` so it can be reloaded in a later session. */
export function saveTasksToFile(filePath: string, tasks: readonly Task[]): void {
  writeFileSync(filePath, serializeTasks(tasks), "utf8");
}

/** Reads a task list previously written by {@link saveTasksToFile}. */
export function loadTasksFromFile(filePath: string): Task[] {
  return deserializeTasks(readFileSync(filePath, "utf8"));
}
