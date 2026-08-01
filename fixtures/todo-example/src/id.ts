import { randomUUID } from "node:crypto";

/** Generates a unique identifier for a new task. */
export function generateTaskId(): string {
  return randomUUID();
}
