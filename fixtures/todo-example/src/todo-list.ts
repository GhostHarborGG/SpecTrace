import { generateTaskId } from "./id.js";
import type { CreateTaskInput, Priority, Task, TaskUpdate } from "./task.js";

/** Filters accepted by {@link TodoList.listTasks}. */
export interface TaskFilter {
  /** When set, only tasks whose `completed` flag matches this value are returned. */
  completed?: boolean;
  /** When set, only tasks with this exact priority are returned. */
  priority?: Priority;
}

/** Aggregate counts describing the current state of the list. */
export interface TodoListSummary {
  total: number;
  completedCount: number;
  remainingCount: number;
  overdueCount: number;
}

const PRIORITY_WEIGHT: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

/**
 * An in-memory list of to-do tasks. Construction accepts an optional clock so
 * callers (and tests) can control what "now" means; most callers can leave
 * it as the default.
 */
export class TodoList {
  private readonly tasks = new Map<string, Task>();
  private readonly archived: Task[] = [];
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  /** Adds a new task to the list and returns it. */
  addTask(input: CreateTaskInput): Task {
    const timestamp = this.now().toISOString();
    const task: Task = {
      id: generateTaskId(),
      title: input.title,
      notes: input.notes ?? "",
      priority: input.priority ?? "medium",
      dueDate: input.dueDate ?? null,
      tags: input.tags ?? [],
      completed: false,
      completedAt: null,
      createdAt: timestamp
    };
    this.tasks.set(task.id, task);
    return task;
  }

  /** Marks an existing task as completed. Throws if the task does not exist. */
  completeTask(id: string): Task {
    const task = this.requireTask(id);
    task.completed = true;
    task.completedAt = this.now().toISOString();
    return task;
  }

  /** Marks a previously completed task as not completed again. Throws if the task does not exist. */
  reopenTask(id: string): Task {
    const task = this.requireTask(id);
    task.completed = false;
    task.completedAt = null;
    return task;
  }

  /** Removes a task from the list. Returns whether a task was actually removed. */
  removeTask(id: string): boolean {
    return this.tasks.delete(id);
  }

  /** Applies a partial set of changes to an existing task and returns the updated task. */
  updateTask(id: string, changes: TaskUpdate): Task {
    const task = this.requireTask(id);
    if (changes.title !== undefined) task.title = changes.title;
    if (changes.notes !== undefined) task.notes = changes.notes;
    if (changes.priority !== undefined) task.priority = changes.priority;
    if (changes.dueDate !== undefined) task.dueDate = changes.dueDate;
    if (changes.tags !== undefined) task.tags = changes.tags;
    return task;
  }

  /** Looks up a single task by ID, or undefined if it does not exist. */
  findTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  /** Lists tasks, optionally narrowed by completion status and/or priority. */
  listTasks(filter: TaskFilter = {}): Task[] {
    let result = [...this.tasks.values()];
    if (filter.completed !== undefined) {
      result = result.filter((task) => task.completed === filter.completed);
    }
    if (filter.priority !== undefined) {
      result = result.filter((task) => task.priority === filter.priority);
    }
    return result;
  }

  /** Lists tasks whose title or notes contain the given text (case-insensitive). */
  searchTasks(query: string): Task[] {
    const needle = query.toLowerCase();
    return [...this.tasks.values()].filter(
      (task) => task.title.toLowerCase().includes(needle) || task.notes.toLowerCase().includes(needle)
    );
  }

  /** Lists tasks carrying the given tag. */
  listTasksByTag(tag: string): Task[] {
    return [...this.tasks.values()].filter((task) => task.tags.includes(tag));
  }

  /**
   * Orders open tasks for a single work session: highest priority first, and
   * for equal priority, the earliest due date first. Tasks with no due date
   * sort after tasks that have one.
   */
  planFocusOrder(): Task[] {
    return this.listTasks({ completed: false }).sort((a, b) => {
      const priorityDelta = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
      if (priorityDelta !== 0) return priorityDelta;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });
  }

  /** Removes every completed task from the active list into a separate archive, and returns the tasks that were moved. */
  sweepCompleted(): Task[] {
    const completed = this.listTasks({ completed: true });
    for (const task of completed) {
      this.tasks.delete(task.id);
      this.archived.push(task);
    }
    return completed;
  }

  /** Lists tasks that have been moved out of the active list by {@link sweepCompleted}. */
  listArchivedTasks(): Task[] {
    return [...this.archived];
  }

  /** Produces aggregate counts describing the current state of the list. */
  getSummary(): TodoListSummary {
    const all = [...this.tasks.values()];
    const nowIso = this.now().toISOString();
    const completedCount = all.filter((task) => task.completed).length;
    const overdueCount = all.filter(
      (task) => !task.completed && task.dueDate !== null && task.dueDate < nowIso
    ).length;
    return {
      total: all.length,
      completedCount,
      remainingCount: all.length - completedCount,
      overdueCount
    };
  }

  private requireTask(id: string): Task {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`No task with id "${id}" exists.`);
    }
    return task;
  }
}
