---
id: REQ-TODO-001
title: Add a new task
status: proposed
priority: high
difficulty: high-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - Calling addTask with at least a title creates a task with that title.
  - The created task is included in subsequent calls to listTasks.
---

# Add a new task

## Statement

The system shall add a new task to the list when addTask is called with at
least a title, and shall return the created task.

## Rationale

Adding a task is the basic entry point for all other list behavior; nothing
else is meaningful until a task exists.

## Notes

Written from the README's "Track work items" feature description and API
reference before inspecting the implementation.
