/** Relative urgency of a task. */
export type Priority = "low" | "medium" | "high";

/** A single to-do item tracked by the list. */
export interface Task {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  /** ISO 8601 date string, or null if the task has no deadline. */
  dueDate: string | null;
  tags: string[];
  completed: boolean;
  /** ISO 8601 timestamp the task was completed at, or null if it is still open. */
  completedAt: string | null;
  /** ISO 8601 timestamp the task was created at. */
  createdAt: string;
}

/** Fields a caller supplies when creating a task; everything but `title` is optional. */
export interface CreateTaskInput {
  title: string;
  notes?: string;
  priority?: Priority;
  dueDate?: string | null;
  tags?: string[];
}

/** Fields a caller may change on an existing task. */
export type TaskUpdate = Partial<CreateTaskInput>;
