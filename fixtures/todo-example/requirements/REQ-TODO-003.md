---
id: REQ-TODO-003
title: Remove a task
status: proposed
priority: medium
difficulty: high-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - Calling removeTask with a valid id removes the task so it no longer appears in listTasks.
  - Calling removeTask returns whether a task was actually removed.
---

# Remove a task

## Statement

The system shall remove a task from the list when removeTask is called with
its id.

## Rationale

Work that's no longer relevant needs to be deletable, not just marked
complete.

## Notes

Written from the README's "Remove work that's no longer relevant" feature
description before inspecting the implementation.
