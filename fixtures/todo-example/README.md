# todo-example

A small, dependency-free to-do list library. This is **example target data**
for [`spectrace-prelim`](../spectrace-prelim/README.md) — it exists so the
tool has a real (if small) TypeScript repository and a real set of
requirements to index, retrieve against, and rank, without needing to freeze
an external repository first. It is not itself part of the SpecTrace tool.

## Features

- **Track work items.** Add a task with a title, optional notes, a priority
  (low, medium, or high), an optional due date, and any number of tags.
- **Mark work done, and undo that if needed.** A task can be completed, and a
  completed task can be reopened if it turns out it wasn't actually finished.
- **Remove work that's no longer relevant.** A task can be deleted from the
  list outright.
- **Edit details after the fact.** A task's title, notes, priority, due date,
  and tags can all be changed after it's created, without losing its identity
  or its original creation time.
- **See only what matters right now.** The list can be narrowed down to just
  the tasks that are still outstanding, or just the ones that have already
  been finished.
- **Find something by what it says.** A task can be looked up by searching
  for text that appears in its title or its notes, regardless of letter
  case.
- **Get the numbers at a glance.** A short summary reports how many tasks
  exist in total, how many are finished, and how many are still remaining.
- **Plan a focused work session.** The open work items can be put into a
  single recommended order: the most urgent ones first, and — among equally
  urgent items — the ones with the nearest deadline first.
- **Group related work under a label.** Any task can carry one or more
  labels, and every task sharing a given label can be retrieved together.
- **Keep the active list uncluttered.** Finished work can be swept out of the
  active list into a separate holding area, so the active list only ever
  shows work that's still in progress. Anything swept out stays retrievable
  afterward.
- **Make it survive a restart.** The whole list can be written to disk and
  loaded back later, so it isn't lost when the application closes and
  reopens.

## API reference

```ts
import { TodoList } from "./src/todo-list.js";

const list = new TodoList();

list.addTask({ title: "Write report", priority: "high" });
list.completeTask(id);
list.reopenTask(id);
list.removeTask(id);
list.updateTask(id, { title: "Write final report" });
list.findTask(id);
list.listTasks({ completed: false });
list.searchTasks("report");
list.listTasksByTag("work");
list.planFocusOrder();
list.listArchivedTasks();
list.sweepCompleted();
list.getSummary();
```

Persisting a list to disk and loading it back:

```ts
import { saveTasksToFile, loadTasksFromFile } from "./src/persistence.js";

saveTasksToFile("./tasks.json", list.listTasks());
const restored = loadTasksFromFile("./tasks.json");
```

## Development

```bash
npm install
npm run typecheck
npm run build
```
